import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { sendTelegramMessage, escapeHtml, preview } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

type Kind = 'apt_post' | 'apt_comment' | 'community_post' | 'community_comment';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://melnberg.com';

function housingLabel(n: number | null | undefined): string {
  if (n == null) return '';
  if (n === 0) return '무주택';
  return `${n}주택`;
}

export async function POST(req: NextRequest) {
  let body: { kind?: string; refId?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const kind = body.kind as Kind;
  const refId = Number(body.refId);
  if (!kind || !['apt_post', 'apt_comment', 'community_post', 'community_comment'].includes(kind) || !Number.isFinite(refId) || refId <= 0) {
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

  let title = '';
  let content = '';
  let url = SITE_URL;
  let category = '';
  let parentTitle = '';

  if (kind === 'community_post') {
    const { data } = await admin.from('posts').select('id, title, content, author_id, category').eq('id', refId).maybeSingle();
    const r = data as { id: number; title: string; content: string; author_id: string; category: string } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    title = r.title;
    content = r.content;
    url = `${SITE_URL}/${r.category === 'blog' ? 'blog' : 'community'}/${r.id}`;
    category = r.category === 'blog' ? '블로그' : '커뮤니티';
  } else if (kind === 'community_comment') {
    const { data } = await admin
      .from('comments')
      .select('id, post_id, content, author_id, post:posts!post_id(title, category)')
      .eq('id', refId).maybeSingle();
    const r = data as { id: number; post_id: number; content: string; author_id: string; post: { title: string | null; category: string | null } | null } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    title = '';
    content = r.content;
    parentTitle = r.post?.title ?? '(삭제된 글)';
    url = `${SITE_URL}/${r.post?.category === 'blog' ? 'blog' : 'community'}/${r.post_id}`;
    category = r.post?.category === 'blog' ? '블로그 댓글' : '커뮤니티 댓글';
  } else if (kind === 'apt_post') {
    const { data } = await admin
      .from('apt_discussions')
      .select('id, apt_master_id, title, content, author_id, apt_master(apt_nm, dong)')
      .eq('id', refId).maybeSingle();
    const r = data as { id: number; apt_master_id: number; title: string; content: string | null; author_id: string; apt_master: { apt_nm: string | null; dong: string | null } | null } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    title = r.title;
    content = r.content ?? '';
    url = `${SITE_URL}/?apt=${r.apt_master_id}`;
    category = `단지글 · ${r.apt_master?.apt_nm ?? '?'}`;
  } else if (kind === 'apt_comment') {
    const { data } = await admin
      .from('apt_discussion_comments')
      .select('id, discussion_id, content, author_id, discussion:apt_discussions!discussion_id(title, apt_master_id, apt_master(apt_nm))')
      .eq('id', refId).maybeSingle();
    const r = data as { id: number; discussion_id: number; content: string; author_id: string; discussion: { title: string | null; apt_master_id: number | null; apt_master: { apt_nm: string | null } | null } | null } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    title = '';
    content = r.content;
    parentTitle = r.discussion?.title ?? '(삭제된 글)';
    url = `${SITE_URL}/?apt=${r.discussion?.apt_master_id ?? 0}`;
    category = `단지댓글 · ${r.discussion?.apt_master?.apt_nm ?? '?'}`;
  }

  // 작성자 표시
  const { data: prof } = await admin
    .from('profiles')
    .select('display_name, apt_count, tier, tier_expires_at')
    .eq('id', user.id).maybeSingle();
  const p = prof as { display_name: string | null; apt_count: number | null; tier: string | null; tier_expires_at: string | null } | null;
  const author = p?.display_name ?? '회원';
  const housing = housingLabel(p?.apt_count);
  const isPaid = p?.tier === 'paid' && (!p?.tier_expires_at || new Date(p.tier_expires_at).getTime() > Date.now());

  // 메시지 조립
  const head = `🔔 <b>[${escapeHtml(category)}]</b> ${escapeHtml(author)}` +
    (housing ? ` <i>(${housing})</i>` : '') +
    (isPaid ? ' 🪪조합원' : '');
  const body1 = title ? `<b>${escapeHtml(title)}</b>\n${escapeHtml(preview(content, 220))}` : escapeHtml(preview(content, 240));
  const body2 = parentTitle ? `\n↳ <i>${escapeHtml(preview(parentTitle, 80))}</i>` : '';
  const link = `\n\n👉 ${url}`;
  const text = `${head}\n\n${body1}${body2}${link}`;

  const result = await sendTelegramMessage(text, { parseMode: 'HTML', disablePreview: false });
  if (!result.ok) {
    console.error('[telegram/notify] send failed:', result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message_id: result.message_id });
}
