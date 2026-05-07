// 국세청 사업자등록정보 진위확인 API 호출.
// 입력값(b_no, p_nm, start_dt) 은 검증에만 사용 — DB 에 저장 X.
// 응답이 '유효' 면 ok=true. 외부 API 키 없으면 비활성 모드 (개발 편의).

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const NTS_VALIDATE_URL = 'https://api.odcloud.kr/api/nts-businessman/v1/validate';

export async function POST(req: NextRequest) {
  let body: { b_no?: string; p_nm?: string; start_dt?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const b_no = (body.b_no ?? '').replace(/[-\s]/g, '');
  const p_nm = (body.p_nm ?? '').trim();
  const start_dt = (body.start_dt ?? '').replace(/[-\s.]/g, '');

  if (!/^\d{10}$/.test(b_no)) return NextResponse.json({ ok: false, error: '사업자번호는 숫자 10자리' }, { status: 400 });
  if (!p_nm) return NextResponse.json({ ok: false, error: '대표자명 필수' }, { status: 400 });
  if (!/^\d{8}$/.test(start_dt)) return NextResponse.json({ ok: false, error: '개업일자는 YYYYMMDD 8자리' }, { status: 400 });

  const apiKey = process.env.NTS_API_KEY;
  if (!apiKey) {
    // 개발/임시 — 키 없을 때 통과시키지 않음. 명시적 에러.
    return NextResponse.json({ ok: false, error: 'NTS_API_KEY 환경변수 미설정' }, { status: 500 });
  }

  try {
    const r = await fetch(`${NTS_VALIDATE_URL}?serviceKey=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businesses: [{ b_no, p_nm, start_dt }] }),
      cache: 'no-store',
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `NTS API ${r.status}: ${txt.slice(0, 200)}` }, { status: 502 });
    }
    const j = await r.json();
    // 응답: { status_code: 'OK', data: [{ valid: '01' | '02', valid_msg, ... }] }
    // valid = '01' 일치, '02' 불일치
    const item = j?.data?.[0];
    const valid = item?.valid === '01';
    if (!valid) {
      return NextResponse.json({ ok: false, error: item?.valid_msg ?? '검증 실패 (입력값 불일치)' });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'NTS API 호출 실패' }, { status: 502 });
  }
}
