// 국토부 실거래가 일일 자동 적재 — Vercel Cron으로 매일 1회 호출
// 적재 범위: 수도권 핵심 시군구 (서울 25 + 인천 8 + 경기 35) × 최근 2개월
// (이전 달 + 이번 달; 늦은 신고 거래까지 누락 없이 보강)
//
// 인증: Vercel Cron이 Authorization: Bearer ${CRON_SECRET} 헤더 자동 첨부.
// 환경변수 필요: MOLIT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 최대 5분 (서울+수도권 67개 시군구 × 2개월 ≈ 2~3분 예상)

const CAPITAL_LAWD_CDS: Array<[string, string]> = [
  // 서울 25개구
  ['11110', '서울 종로구'], ['11140', '서울 중구'], ['11170', '서울 용산구'],
  ['11200', '서울 성동구'], ['11215', '서울 광진구'], ['11230', '서울 동대문구'],
  ['11260', '서울 중랑구'], ['11290', '서울 성북구'], ['11305', '서울 강북구'],
  ['11320', '서울 도봉구'], ['11350', '서울 노원구'], ['11380', '서울 은평구'],
  ['11410', '서울 서대문구'], ['11440', '서울 마포구'], ['11470', '서울 양천구'],
  ['11500', '서울 강서구'], ['11530', '서울 구로구'], ['11545', '서울 금천구'],
  ['11560', '서울 영등포구'], ['11590', '서울 동작구'], ['11620', '서울 관악구'],
  ['11650', '서울 서초구'], ['11680', '서울 강남구'], ['11710', '서울 송파구'],
  ['11740', '서울 강동구'],
  // 인천 8개구
  ['28110', '인천 중구'], ['28140', '인천 동구'], ['28177', '인천 미추홀구'],
  ['28185', '인천 연수구'], ['28200', '인천 남동구'], ['28237', '인천 부평구'],
  ['28245', '인천 계양구'], ['28260', '인천 서구'],
  // 경기 핵심 35개
  ['41111', '수원시 장안구'], ['41113', '수원시 권선구'], ['41115', '수원시 팔달구'],
  ['41117', '수원시 영통구'], ['41131', '성남시 수정구'], ['41133', '성남시 중원구'],
  ['41135', '성남시 분당구'], ['41150', '의정부시'], ['41171', '안양시 만안구'],
  ['41173', '안양시 동안구'], ['41192', '부천시'], ['41210', '광명시'],
  ['41220', '평택시'], ['41281', '고양시 덕양구'], ['41285', '고양시 일산동구'],
  ['41287', '고양시 일산서구'], ['41290', '과천시'], ['41310', '구리시'],
  ['41360', '남양주시'], ['41390', '시흥시'], ['41410', '군포시'],
  ['41430', '의왕시'], ['41450', '하남시'], ['41463', '용인시 처인구'],
  ['41465', '용인시 기흥구'], ['41467', '용인시 수지구'], ['41480', '파주시'],
  ['41500', '이천시'], ['41550', '안성시'], ['41570', '김포시'],
  ['41590', '화성시'], ['41610', '광주시'], ['41630', '양주시'],
  ['41650', '포천시'], ['41670', '여주시'],
];

type ParsedTrade = {
  lawd_cd: string;
  apt_nm: string;
  exclu_use_ar: number;
  floor: number | null;
  build_year: number | null;
  road_nm: string | null;
  road_nm_bonbun: string | null;
  road_nm_bubun: string | null;
  dong: string | null;
  jibun: string | null;
  deal_year: number;
  deal_month: number;
  deal_day: number;
  deal_amount: number;
  agent_nm: string | null;
  deal_type: string | null;
  reg_date: string | null;
  cancel_deal_type: string | null;
  cancel_deal_day: string | null;
};

function parseItems(xml: string, lawdCd: string): ParsedTrade[] {
  const out: ParsedTrade[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const get = (tag: string): string | null => {
      const r = body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
      return r ? r[1].trim() : null;
    };
    const dealAmountRaw = get('dealAmount');
    const dealAmount = dealAmountRaw ? Number(dealAmountRaw.replace(/[\s,]/g, '')) : NaN;
    const dealYear = get('dealYear');
    const dealMonth = get('dealMonth');
    const dealDay = get('dealDay');
    const aptNm = get('aptNm');
    const excluUseAr = Number(get('excluUseAr'));
    if (!aptNm || !dealYear || !dealMonth || !dealDay || !Number.isFinite(dealAmount) || !Number.isFinite(excluUseAr)) continue;
    out.push({
      lawd_cd: lawdCd,
      apt_nm: aptNm,
      exclu_use_ar: excluUseAr,
      floor: get('floor') ? Number(get('floor')) : null,
      build_year: get('buildYear') ? Number(get('buildYear')) : null,
      road_nm: get('roadNm'),
      road_nm_bonbun: get('roadNmBonbun'),
      road_nm_bubun: get('roadNmBubun'),
      dong: get('umdNm'),
      jibun: get('jibun'),
      deal_year: Number(dealYear),
      deal_month: Number(dealMonth),
      deal_day: Number(dealDay),
      deal_amount: dealAmount,
      agent_nm: get('estateAgentSggNm'),
      deal_type: get('dealingGbn'),
      reg_date: get('rgstDate'),
      cancel_deal_type: get('cdealType'),
      cancel_deal_day: get('cdealDay'),
    });
  }
  return out;
}

async function fetchMonth(apiKey: string, lawdCd: string, dealYmd: string): Promise<ParsedTrade[]> {
  const endpoint = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
  const all: ParsedTrade[] = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const params = new URLSearchParams({
      serviceKey: apiKey, LAWD_CD: lawdCd, DEAL_YMD: dealYmd,
      pageNo: String(page), numOfRows: String(perPage),
    });
    const res = await fetch(`${endpoint}?${params.toString()}`);
    const xml = await res.text();
    if (!res.ok) throw new Error(`API ${res.status}: ${xml.slice(0, 200)}`);
    const code = xml.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1];
    if (code !== '000') {
      const msg = xml.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1];
      throw new Error(`API resultCode=${code} (${msg})`);
    }
    const total = Number(xml.match(/<totalCount>([^<]+)<\/totalCount>/)?.[1] ?? '0');
    all.push(...parseItems(xml, lawdCd));
    if (page * perPage >= total) break;
    page++;
  }
  return all;
}

function lastTwoYyyymm(): string[] {
  // KST 기준 이번 달, 이전 달
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const cur = `${y}${String(m).padStart(2, '0')}`;
  const prev = `${prevY}${String(prevM).padStart(2, '0')}`;
  return [prev, cur];
}

export async function GET(req: NextRequest) {
  // 인증 — Vercel Cron만 허용
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.MOLIT_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey) return NextResponse.json({ error: 'MOLIT_API_KEY 누락' }, { status: 500 });
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'SUPABASE 환경변수 누락' }, { status: 500 });

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const months = lastTwoYyyymm();
  const startedAt = Date.now();
  const results: Array<{ lawd: string; ymd: string; fetched: number; inserted: number; error?: string }> = [];

  for (const [lawdCd, label] of CAPITAL_LAWD_CDS) {
    for (const ymd of months) {
      try {
        const rows = await fetchMonth(apiKey, lawdCd, ymd);
        if (rows.length === 0) {
          results.push({ lawd: `${label}(${lawdCd})`, ymd, fetched: 0, inserted: 0 });
          continue;
        }
        const { data, error } = await supabase
          .from('apt_trades')
          .upsert(rows, {
            onConflict: 'apt_nm,jibun,exclu_use_ar,floor,deal_year,deal_month,deal_day,deal_amount',
            ignoreDuplicates: true,
          })
          .select('id');
        if (error) {
          results.push({ lawd: `${label}(${lawdCd})`, ymd, fetched: rows.length, inserted: 0, error: error.message });
        } else {
          results.push({ lawd: `${label}(${lawdCd})`, ymd, fetched: rows.length, inserted: data?.length ?? 0 });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ lawd: `${label}(${lawdCd})`, ymd, fetched: 0, inserted: 0, error: msg });
      }
      // API 부담 분산
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const totalFetched = results.reduce((s, r) => s + r.fetched, 0);
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const errors = results.filter((r) => r.error).length;
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`[molit-cron] ${CAPITAL_LAWD_CDS.length}개 시군구 × ${months.length}개월, fetch ${totalFetched}건 / insert ${totalInserted}건 / 오류 ${errors}건 / ${elapsedSec}초`);

  return NextResponse.json({
    months,
    total_sgg: CAPITAL_LAWD_CDS.length,
    fetched: totalFetched,
    inserted: totalInserted,
    errors,
    elapsed_sec: Number(elapsedSec),
    error_details: results.filter((r) => r.error).slice(0, 10),
  });
}
