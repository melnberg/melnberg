import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chunkText, embedTexts } from '@/lib/openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type IncomingPost = {
  title: string;
  content: string;
  external_id?: string | null;
  external_url?: string | null;
  posted_at?: string | null;
};

type Result = { external_id: string | null; title: string; chunks: number; post_id?: number; error?: string; skipped?: boolean };

const EMBED_BATCH = 100; // OpenAI batch size per call (text-embedding-3-small allows up to 2048, we keep safe)

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

  let body: { posts?: IncomingPost[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
  }

  const incoming = (body.posts ?? []).filter((p): p is IncomingPost => !!p?.title?.trim() && !!p?.content?.trim());
  if (incoming.length === 0) return NextResponse.json({ error: '업로드할 글이 없습니다.', results: [] }, { status: 400 });

  const results: Result[] = [];

  // 1. 중복 검사 — 같은 external_id로 이미 들어간 글은 skip
  const externalIds = incoming.map((p) => p.external_id?.trim()).filter((x): x is string => !!x);
  const existingIds = new Set<string>();
  if (externalIds.length > 0) {
    const { data: existing } = await supabase
      .from('cafe_posts')
      .select('external_id')
      .eq('source', 'melnberg')
      .in('external_id', externalIds);
    for (const row of existing ?? []) {
      if (row.external_id) existingIds.add(row.external_id as string);
    }
  }

  const newPosts = incoming.filter((p) => {
    if (!p.external_id?.trim()) return true;
    if (existingIds.has(p.external_id.trim())) {
      results.push({ external_id: p.external_id, title: p.title, chunks: 0, skipped: true });
      return false;
    }
    return true;
  });

  if (newPosts.length === 0) {
    return NextResponse.json({ results });
  }

  // 2. cafe_posts 일괄 insert
  const { data: insertedPosts, error: insertErr } = await supabase
    .from('cafe_posts')
    .insert(
      newPosts.map((p) => ({
        title: p.title.trim(),
        content: p.content.trim(),
        external_id: p.external_id?.trim() || null,
        external_url: p.external_url?.trim() || null,
        posted_at: p.posted_at || null,
        ingested_by: user.id,
      })),
    )
    .select('id, external_id, title');

  if (insertErr || !insertedPosts) {
    return NextResponse.json({ error: `cafe_posts 저장 실패: ${insertErr?.message}`, results }, { status: 500 });
  }

  // post.id를 incoming 순서대로 매핑
  const postIdByOrder = insertedPosts.map((row) => row.id as number);

  // 3. 청킹 + 임베딩 배치
  type ChunkPlan = { postIdx: number; chunkIndex: number; embedText: string; rawText: string };
  const plan: ChunkPlan[] = [];

  newPosts.forEach((p, idx) => {
    const chunks = chunkText(p.content);
    chunks.forEach((c, ci) => {
      plan.push({
        postIdx: idx,
        chunkIndex: ci,
        embedText: `# ${p.title}\n\n${c}`,
        rawText: c,
      });
    });
  });

  // 임베딩을 EMBED_BATCH 단위로 호출
  const allEmbeddings: number[][] = new Array(plan.length);
  for (let i = 0; i < plan.length; i += EMBED_BATCH) {
    const slice = plan.slice(i, i + EMBED_BATCH);
    try {
      const vectors = await embedTexts(slice.map((s) => s.embedText));
      for (let k = 0; k < vectors.length; k++) {
        allEmbeddings[i + k] = vectors[k];
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '임베딩 실패';
      // 이 배치만 실패 표시 후 다음 배치 진행
      for (let k = 0; k < slice.length; k++) {
        const postIdx = slice[k].postIdx;
        // 이미 결과 push 안 했으면 push
        const existing = results.find((r) => r.external_id === (newPosts[postIdx].external_id ?? null) && r.title === newPosts[postIdx].title);
        if (!existing) {
          results.push({
            external_id: newPosts[postIdx].external_id ?? null,
            title: newPosts[postIdx].title,
            chunks: 0,
            post_id: postIdByOrder[postIdx],
            error: `임베딩 실패: ${msg}`,
          });
        }
      }
    }
  }

  // 4. cafe_post_chunks 일괄 insert
  const chunkRows: Array<{ post_id: number; chunk_index: number; content: string; embedding: string }> = [];
  for (let i = 0; i < plan.length; i++) {
    const v = allEmbeddings[i];
    if (!v) continue; // 임베딩 실패한 것 skip
    const item = plan[i];
    chunkRows.push({
      post_id: postIdByOrder[item.postIdx],
      chunk_index: item.chunkIndex,
      content: item.rawText,
      embedding: v as unknown as string,
    });
  }

  // chunks도 큰 배치는 분할 insert (Postgres 행 제한·payload 크기 고려)
  const CHUNK_INSERT_BATCH = 200;
  for (let i = 0; i < chunkRows.length; i += CHUNK_INSERT_BATCH) {
    const slice = chunkRows.slice(i, i + CHUNK_INSERT_BATCH);
    const { error: chunkErr } = await supabase.from('cafe_post_chunks').insert(slice);
    if (chunkErr) {
      // 실패한 배치에 속한 post들 표시
      const failedPostIds = new Set(slice.map((c) => c.post_id));
      for (const pid of failedPostIds) {
        const idx = postIdByOrder.indexOf(pid);
        if (idx >= 0) {
          results.push({
            external_id: newPosts[idx].external_id ?? null,
            title: newPosts[idx].title,
            chunks: 0,
            post_id: pid,
            error: `청크 저장 실패: ${chunkErr.message}`,
          });
        }
      }
    }
  }

  // 5. 정상 처리된 post들 결과 채우기
  newPosts.forEach((p, idx) => {
    const pid = postIdByOrder[idx];
    if (results.find((r) => r.post_id === pid)) return; // 이미 에러 푸시된 거 skip
    const chunkCount = chunkRows.filter((c) => c.post_id === pid).length;
    results.push({
      external_id: p.external_id ?? null,
      title: p.title,
      chunks: chunkCount,
      post_id: pid,
    });
  });

  return NextResponse.json({ results });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id 누락' }, { status: 400 });

  const { error } = await supabase.from('cafe_posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
