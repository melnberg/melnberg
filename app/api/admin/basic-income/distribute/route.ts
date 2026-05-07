import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { sendTelegramMessage, escapeHtml } from '@/lib/telegram';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

// 기본소득 지급 + 공지 등록 + (옵션) 텔레그램 발송.
// body: {
//   tiers: [{ pct: number, amount: number }, ...],
//   announcement: { title: string, body?: string } | null,
//   sendTelegram: boolean
// }
export async function POST(req: NextRequest) {
  let body: {
    tiers?: Array<{ pct: number; amount: number }>;
    announcement?: { title: string; body?: string } | null;
    sendTelegram?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const tiers = body.tiers ?? [];
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return NextResponse.json({ error: 'tiers 필수' }, { status: 400 });
  }

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

  // 1) 공지 먼저 등록 — 지급 RPC 가 announcement_id 를 받음 (감사 추적)
  let announcementId: number | null = null;
  if (body.announcement?.title) {
    const { data: ann, error: annErr } = await admin
      .from('site_announcements')
      .insert({
        title: body.announcement.title.trim(),
        body: body.announcement.body?.trim() || null,
        link_url: null,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (annErr || !ann) {
      return NextResponse.json({ error: `공지 등록 실패: ${annErr?.message ?? 'unknown'}` }, { status: 500 });
    }
    announcementId = ann.id;
  }

  // 2) 지급 — RPC (트랜잭션, 같은 날 중복 차단 내장)
  const { data, error } = await sb.rpc('distribute_basic_income', {
    p_tiers: tiers,
    p_announcement_id: announcementId,
    p_note: null,
  });
  if (error) {
    // 공지 롤백 — 이미 등록된 공지는 삭제 (중복 지급 차단 시 깨끗하게)
    if (announcementId) {
      await admin.from('site_announcements').update({ deleted_at: new Date().toISOString() }).eq('id', announcementId);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { out_total_recipients: number; out_total_paid: number; out_event_id: number }
    | undefined;

  // 3) 홈 피드 캐시 무효화 (공지가 피드에 보임)
  revalidateTag('home-feed');

  // 4) 텔레그램 발송 (옵션)
  let telegramStatus: 'sent' | 'skipped' | string = 'skipped';
  if (body.sendTelegram && body.announcement?.title) {
    const t = body.announcement.title;
    const b = body.announcement.body ?? '';
    const text = `💸 <b>${escapeHtml(t)}</b>${b ? '\n\n' + escapeHtml(b.length > 280 ? b.slice(0, 280) + '…' : b) : ''}`;
    const tg = await sendTelegramMessage(text, { parseMode: 'HTML', disablePreview: false });
    telegramStatus = tg.ok ? 'sent' : `failed: ${tg.error}`;
  }

  return NextResponse.json({
    ok: true,
    eventId: row?.out_event_id ?? null,
    totalRecipients: row?.out_total_recipients ?? 0,
    totalPaid: row?.out_total_paid ?? 0,
    announcementId,
    telegram: telegramStatus,
  });
}
