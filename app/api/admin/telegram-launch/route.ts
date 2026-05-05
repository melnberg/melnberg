import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

const MESSAGES = [
  `🛒 <b>이마트 분양 시작</b>
· 분양가 5 mlbg
· 매일 +1 mlbg (5일 회수)
· 1인 1점포
지도 노란 e 핀 클릭`,
  `🏭 <b>SK하이닉스 분양 시작</b>
· 이천·청주 캠퍼스
· 분양가 1,000 mlbg
· 매일 +20 mlbg (50일 회수)
지도 빨간 H 핀 클릭`,
  `🏭 <b>삼성전자 분양 시작</b>
· 평택 캠퍼스
· 분양가 800 mlbg
· 매일 +20 mlbg (40일 회수)
지도 파란 S 핀 클릭`,
  `🛒 <b>코스트코 분양 시작</b>
· 양재·상봉·의정부·일산·광명·하남 6점
· 분양가 50 mlbg
· 매일 +5 mlbg (10일 회수)
지도 진파랑 C 핀 클릭`,
  `🚩 <b>금속노조 분양 시작</b>
· 본부·경기·인천 3지부
· 분양가 10 mlbg
· 매일 +1 mlbg (10일 회수)
지도 진남색 금속 핀 클릭`,
  `🚛 <b>화물연대 분양 시작</b>
· 본부·경기·부산 3지부
· 분양가 10 mlbg
· 매일 +1 mlbg (10일 회수)
지도 초록 화물 핀 클릭`,
];

export async function POST() {
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

  const results: Array<{ ok: boolean; error?: string }> = [];
  for (const msg of MESSAGES) {
    const r = await sendTelegramMessage(msg, { parseMode: 'HTML', disablePreview: true });
    results.push({ ok: r.ok, error: r.ok ? undefined : r.error });
    // 500ms 간격 — 텔레그램 rate limit 회피
    await new Promise((res) => setTimeout(res, 500));
  }
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({ ok: failed.length === 0, sent: results.length - failed.length, failed: failed.length, errors: failed.map((f) => f.error) });
}
