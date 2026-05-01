import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chunkText, embedTexts } from '@/lib/openai';

type IncomingPost = {
  title: string;
  content: string;
  external_id?: string | null;
  external_url?: string | null;
  posted_at?: string | null;
};

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
  const posts = (body.posts ?? []).filter((p): p is IncomingPost => !!p?.title?.trim() && !!p?.content?.trim());
  if (posts.length === 0) return NextResponse.json({ error: '업로드할 글이 없습니다.' }, { status: 400 });

  const results: Array<{ title: string; chunks: number; post_id?: number; error?: string }> = [];

  for (const incoming of posts) {
    try {
      const { data: postRow, error: postErr } = await supabase
        .from('cafe_posts')
        .insert({
          title: incoming.title.trim(),
          content: incoming.content.trim(),
          external_id: incoming.external_id?.trim() || null,
          external_url: incoming.external_url?.trim() || null,
          posted_at: incoming.posted_at || null,
          ingested_by: user.id,
        })
        .select('id')
        .single();

      if (postErr || !postRow) {
        results.push({ title: incoming.title, chunks: 0, error: postErr?.message ?? '저장 실패' });
        continue;
      }

      // 청킹: 제목 + 본문을 한 덩어리로 보고 쪼갬. 각 청크 앞에 제목 prefix 붙여 검색 정확도 ↑
      const chunks = chunkText(incoming.content);
      const enriched = chunks.map((c) => `# ${incoming.title}\n\n${c}`);
      const embeddings = await embedTexts(enriched);

      const rows = chunks.map((c, i) => ({
        post_id: postRow.id,
        chunk_index: i,
        content: c,
        embedding: embeddings[i] as unknown as string, // pgvector accepts number[] via supabase-js
      }));

      const { error: chunkErr } = await supabase.from('cafe_post_chunks').insert(rows);
      if (chunkErr) {
        results.push({ title: incoming.title, chunks: 0, post_id: postRow.id, error: `청크 저장 실패: ${chunkErr.message}` });
        continue;
      }

      results.push({ title: incoming.title, chunks: chunks.length, post_id: postRow.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      results.push({ title: incoming.title, chunks: 0, error: msg });
    }
  }

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
