// SQL 파일을 Supabase 에 자동 실행.
// 사용:
//   node scripts/sql-apply.mjs supabase/194_facility_dividend_10pct.sql
//   node scripts/sql-apply.mjs supabase/193_*.sql supabase/194_*.sql   (여러 개)
//   node scripts/sql-apply.mjs --since 192   (191 이후 모든 supabase/NNN_*.sql 일괄)
//
// 필요한 .env.local 항목 (1회 세팅):
//   SUPABASE_ACCESS_TOKEN  — supabase.com/dashboard/account/tokens 에서 발급한 personal access token
//   NEXT_PUBLIC_SUPABASE_URL  — 이미 있음 (프로젝트 ref 자동 추출)

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

// .env.local 읽기
const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN 미설정. supabase.com/dashboard/account/tokens 에서 만들어 .env.local 에 추가.');
  process.exit(1);
}
if (!SB_URL) {
  console.error('NEXT_PUBLIC_SUPABASE_URL 미설정.');
  process.exit(1);
}
const REF_MATCH = SB_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
if (!REF_MATCH) {
  console.error(`SUPABASE_URL 에서 프로젝트 ref 추출 실패: ${SB_URL}`);
  process.exit(1);
}
const PROJECT_REF = REF_MATCH[1];

// 인자 처리
const args = process.argv.slice(2);
let files = [];
const sinceIdx = args.indexOf('--since');
if (sinceIdx >= 0) {
  const sinceNum = Number(args[sinceIdx + 1]);
  if (!Number.isFinite(sinceNum)) {
    console.error('--since <숫자> 형식이어야 함');
    process.exit(1);
  }
  const all = readdirSync(resolve(process.cwd(), 'supabase'))
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .filter((f) => Number(f.slice(0, 3)) > sinceNum)
    .sort()
    .map((f) => `supabase/${f}`);
  files = all;
} else {
  files = args;
}

if (files.length === 0) {
  console.error('usage: node scripts/sql-apply.mjs <sql-file...> | --since <NNN>');
  process.exit(1);
}

console.log(`[sql-apply] project=${PROJECT_REF} files=${files.length}`);

let success = 0;
let failed = 0;
for (const file of files) {
  const sql = readFileSync(resolve(process.cwd(), file), 'utf8');
  process.stdout.write(`  • ${basename(file)} (${sql.length}B)... `);
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (res.ok) {
    console.log('OK');
    success++;
  } else {
    const text = await res.text();
    console.log(`FAIL [${res.status}]`);
    console.error('    ', text.slice(0, 500));
    failed++;
  }
}

console.log(`\n[sql-apply] success=${success} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
