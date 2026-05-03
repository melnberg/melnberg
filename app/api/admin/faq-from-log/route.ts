import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chunkText, embedTexts } from '@/lib/openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Body = { log_id: number; title: string; content: string };

const FAQ_SOURCE = 'faq';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_admin) return { error: NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 }) };
  return { supabase, user };
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
  }

  const logId = Number(body.log_id);
  const title = (body.title ?? '').trim();
  const content = (body.content ?? '').trim();
  if (!logId || !title || !content) {
    return NextResponse.json({ error: 'log_id, title, content 필수' }, { status: 400 });
  }

  const externalId = `log_${logId}`;

  // upsert: 기존 FAQ 글 있으면 삭제 (chunks는 cascade)
  await supabase.from('cafe_posts').delete().eq('source', FAQ_SOURCE).eq('external_id', externalId);

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabase
    .from('cafe_posts')
    .insert({
      source: FAQ_SOURCE,
      external_id: externalId,
      external_url: null,
      title,
      content,
      posted_at: nowIso,
      ingested_by: user.id,
      category: '콘텐츠',
      content_type: 'FAQ',
      is_meaningful: true,
      metadata_extracted_at: nowIso,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: `저장 실패: ${insertErr?.message ?? '알 수 없음'}` }, { status: 500 });
  }

  const postId = inserted.id as number;

  const chunks = chunkText(content);
  if (chunks.length === 0) {
    return NextResponse.json({ post_id: postId, chunks: 0 });
  }

  let vectors: number[][];
  try {
    vectors = await embedTexts(chunks.map((c) => `# ${title}\n\n${c}`));
  } catch (e) {
    const msg = e instanceof Error ? e.message : '임베딩 실패';
    return NextResponse.json({ error: `임베딩 실패: ${msg}`, post_id: postId, chunks: 0 }, { status: 500 });
  }

  const chunkRows = chunks.map((c, i) => ({
    post_id: postId,
    chunk_index: i,
    content: c,
    embedding: vectors[i] as unknown as string,
  }));

  const { error: chunkErr } = await supabase.from('cafe_post_chunks').insert(chunkRows);
  if (chunkErr) {
    return NextResponse.json({ error: `청크 저장 실패: ${chunkErr.message}`, post_id: postId, chunks: 0 }, { status: 500 });
  }

  return NextResponse.json({ post_id: postId, chunks: chunks.length });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(req.url);
  const logId = Number(searchParams.get('log_id'));
  if (!logId) return NextResponse.json({ error: 'log_id 누락' }, { status: 400 });

  const { error } = await supabase
    .from('cafe_posts')
    .delete()
    .eq('source', FAQ_SOURCE)
    .eq('external_id', `log_${logId}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
