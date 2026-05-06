import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { sendTelegramMessage, escapeHtml } from '@/lib/telegram';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

// 어드민 사이트 공지 작성 — INSERT + 텔레그램 발송 + 홈 피드 캐시 무효화.
export async function POST(req: NextRequest) {
  let body: { title?: string; body?: string; link_url?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const title = (body.title ?? '').trim();
  const text = (body.body ?? '').trim();
  const link = (body.link_url ?? '').trim() || null;
  if (!title) return NextResponse.json({ error: '제목 필수' }, { status: 400 });

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!(prof as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: '어드민만 가능' }, { status: 403 });
  }

  // 1) DB INSERT
  const { data: ins, error: insErr } = await admin
    .from('site_announcements')
    .insert({ title, body: text || null, link_url: link, created_by: user.id })
    .select('id')
    .single();
  if (insErr || !ins) {
    return NextResponse.json({ error: insErr?.message ?? 'insert 실패' }, { status: 500 });
  }

  // 2) 텔레그램 발송
  const linkLine = link ? `\n${link}` : '';
  const bodyLine = text ? `\n\n${text.length > 280 ? text.slice(0, 280) + '…' : text}` : '';
  const tgText = `📣 <b>${escapeHtml(title)}</b>${escapeHtml(bodyLine)}${linkLine ? '\n' + escapeHtml(link!) : ''}`;
  const tg = await sendTelegramMessage(tgText, { parseMode: 'HTML', disablePreview: false });

  // 3) 홈 피드 캐시 무효화
  revalidateTag('home-feed');

  return NextResponse.json({ ok: true, id: ins.id, telegram: tg.ok ? 'sent' : `failed: ${tg.error}` });
}
