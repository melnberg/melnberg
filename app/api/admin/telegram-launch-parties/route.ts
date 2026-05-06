import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

// 정당 본부 7곳 분양 시작 텔레그램 알림 — 일괄 발송.
// 어드민 페이지에서 deploy 완료 후 1회 클릭 권장.
const MESSAGES = [
  `🏛️ <b>정당 본부 분양 시작</b>
영등포구 여의도/당산 정당 7곳 신규 등록.
· 분양가 20 mlbg
· 매일 +1 mlbg (20일 회수)

지도에서 영등포구 국회대로 일대 확인:
· 더불어민주당 (민주, 파랑)
· 국민의힘 (국힘, 빨강)
· 조국혁신당 (조국, 남색)
· 개혁신당 (개혁, 주황)
· 진보당 (진보, 빨강)
· 기본소득당 (기본, 초록)
· 사회민주당 (사민, 와인)`,
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
    await new Promise((res) => setTimeout(res, 500));
  }
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({ ok: failed.length === 0, sent: results.length - failed.length, failed: failed.length, errors: failed.map((f) => f.error) });
}
