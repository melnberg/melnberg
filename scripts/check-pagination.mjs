// PostgREST max-rows 우회 가능한지 페이지네이션 시험
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== range(0, 999), range(1000, 1999) … 페이지네이션 ===');
const allRows = [];
const t0 = Date.now();
for (let offset = 0; offset < 12000; offset += 1000) {
  const { data, error } = await sb
    .from('apt_representative_price')
    .select('apt_nm, umd_nm, lawd_cd, area_group, trade_count, median_amount, window_used, last_deal_date')
    .range(offset, offset + 999);
  if (error) { console.error('Error:', error.message); break; }
  if (!data || data.length === 0) break;
  allRows.push(...data);
  console.log(`  offset ${offset}: ${data.length}건 (누적 ${allRows.length})`);
  if (data.length < 1000) break;
}
const elapsed = Date.now() - t0;
console.log(`\n총 ${allRows.length}건, ${elapsed}ms`);

const banpo = allRows.filter(r => r.apt_nm === '반포자이');
console.log(`\n"반포자이" 매치: ${banpo.length}건`);
for (const r of banpo) console.log(`  ${r.area_group}㎡대 ${(r.median_amount/10000).toFixed(1)}억 (${r.window_used})`);
