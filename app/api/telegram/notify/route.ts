import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { sendTelegramMessage, escapeHtml, preview } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

type Kind = 'apt_post' | 'apt_comment' | 'community_post' | 'community_comment' | 'listing';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://melnberg.com';

export async function POST(req: NextRequest) {
  let body: { kind?: string; refId?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const kind = body.kind as Kind;
  const refId = Number(body.refId);
  if (!kind || !['apt_post', 'apt_comment', 'community_post', 'community_comment', 'listing'].includes(kind) || !Number.isFinite(refId) || refId <= 0) {
    return NextResponse.json({ error: 'kind/refId invalid' }, { status: 400 });
  }

  // 호출자 인증 (작성자만 본인 글 알림 가능)
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  let tag = '';   // 대괄호 안 짧은 라벨
  let main = '';  // 본문 한 줄
  let url = SITE_URL;

  if (kind === 'community_post') {
    const { data } = await admin.from('posts').select('id, title, author_id, category').eq('id', refId).maybeSingle();
    const r = data as { id: number; title: string; author_id: string; category: string } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    tag = r.category === 'blog' ? '블로그' : '커뮤니티';
    main = preview(r.title, 100);
    url = `${SITE_URL}/${r.category === 'blog' ? 'blog' : 'community'}/${r.id}`;
  } else if (kind === 'community_comment') {
    const { data } = await admin
      .from('comments')
      .select('id, post_id, content, author_id, post:posts!post_id(title, category)')
      .eq('id', refId).maybeSingle();
    const r = data as { id: number; post_id: number; content: string; author_id: string; post: { title: string | null; category: string | null } | null } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    tag = r.post?.category === 'blog' ? '블로그 댓글' : '커뮤니티 댓글';
    main = preview(r.content, 80);
    url = `${SITE_URL}/${r.post?.category === 'blog' ? 'blog' : 'community'}/${r.post_id}`;
  } else if (kind === 'apt_post') {
    const { data } = await admin
      .from('apt_discussions')
      .select('id, apt_master_id, title, author_id, apt_master(apt_nm)')
      .eq('id', refId).maybeSingle();
    const r = data as { id: number; apt_master_id: number; title: string; author_id: string; apt_master: { apt_nm: string | null } | null } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    tag = r.apt_master?.apt_nm ?? '단지';
    main = preview(r.title, 80);
    url = `${SITE_URL}/?apt=${r.apt_master_id}`;
  } else if (kind === 'apt_comment') {
    const { data } = await admin
      .from('apt_discussion_comments')
      .select('id, discussion_id, content, author_id, discussion:apt_discussions!discussion_id(apt_master_id, apt_master(apt_nm))')
      .eq('id', refId).maybeSingle();
    const r = data as { id: number; discussion_id: number; content: string; author_id: string; discussion: { apt_master_id: number | null; apt_master: { apt_nm: string | null } | null } | null } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    tag = r.discussion?.apt_master?.apt_nm ?? '단지';
    main = preview(r.content, 80);
    url = `${SITE_URL}/?apt=${r.discussion?.apt_master_id ?? 0}`;
  } else if (kind === 'listing') {
    const { data } = await admin
      .from('apt_listings')
      .select('apt_id, seller_id, price, apt_master(apt_nm)')
      .eq('apt_id', refId).maybeSingle();
    const r = data as { apt_id: number; seller_id: string; price: number; apt_master: { apt_nm: string | null } | null } | null;
    if (!r || r.seller_id !== user.id) return NextResponse.json({ error: 'not seller' }, { status: 403 });
    tag = r.apt_master?.apt_nm ?? '단지';
    main = `매물 ${Number(r.price).toLocaleString()} mlbg`;
    url = `${SITE_URL}/?apt=${r.apt_id}`;
  }

  // 깔끔한 두 줄 포맷:
  //   [tag] main
  //   url
  const text = `[${escapeHtml(tag)}] ${escapeHtml(main)}\n${url}`;
  const result = await sendTelegramMessage(text, { parseMode: 'HTML', disablePreview: true });
  if (!result.ok) {
    console.error('[telegram/notify] send failed:', result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message_id: result.message_id });
}
