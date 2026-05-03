// 국토부 아파트매매 실거래가 상세 자료 — 단발 테스트
// 사용: node scripts/molit-test.mjs [LAWD_CD] [YYYYMM]
// 기본: 강남구(11680), 2026년 4월(202604)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// .env.local 수동 로드 (Next.js 밖에서 실행하므로)
function loadEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  } catch (e) {
    console.error('.env.local 읽기 실패:', e.message);
    process.exit(1);
  }
}

loadEnv();

const apiKey = process.env.MOLIT_API_KEY;
if (!apiKey) {
  console.error('MOLIT_API_KEY가 .env.local에 없습니다.');
  process.exit(1);
}

const lawdCd = process.argv[2] || '11680'; // 강남구
const dealYmd = process.argv[3] || '202604'; // 2026년 4월

const endpoint = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
const params = new URLSearchParams({
  serviceKey: apiKey,
  LAWD_CD: lawdCd,
  DEAL_YMD: dealYmd,
  pageNo: '1',
  numOfRows: '10',
});

const url = `${endpoint}?${params.toString()}`;
console.log(`\n[호출] LAWD_CD=${lawdCd}, DEAL_YMD=${dealYmd}\n`);

const res = await fetch(url);
const xml = await res.text();

// 응답 코드 확인
const resultCode = xml.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1];
const resultMsg = xml.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1];
const totalCount = xml.match(/<totalCount>([^<]+)<\/totalCount>/)?.[1];

console.log(`결과 코드: ${resultCode} (${resultMsg})`);
console.log(`전체 거래 수: ${totalCount}\n`);

if (resultCode !== '000') {
  console.error('API 오류. 원본 응답:\n', xml.slice(0, 500));
  process.exit(1);
}

// item 추출 (느슨한 정규식 파서 — 단발 테스트용)
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
  const body = m[1];
  const get = (tag) => body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]?.trim() ?? null;
  return {
    아파트: get('aptNm'),
    전용면적: get('excluUseAr'),
    층: get('floor'),
    건축년도: get('buildYear'),
    거래일: `${get('dealYear')}-${get('dealMonth')?.padStart(2, '0')}-${get('dealDay')?.padStart(2, '0')}`,
    거래금액: get('dealAmount')?.replace(/[\s,]/g, '') + '만원',
    법정동: get('umdNm'),
    지번: get('jibun'),
    거래유형: get('dealingGbn'),
    해제여부: get('cdealType'),
    해제일자: get('cdealDay'),
    등기일자: get('rgstDate'),
    매도자: get('slerGbn'),
    매수자: get('buyerGbn'),
  };
});

console.log(`첫 ${items.length}건:\n`);
for (const item of items) {
  console.log(item);
  console.log('---');
}
