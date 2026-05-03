// apt_representative_price view 행 수 + default limit 영향 확인
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== 1. view 전체 행 수 ===');
{
  const { count } = await sb
    .from('apt_representative_price')
    .select('*', { count: 'exact', head: true });
  console.log(`총 행: ${count}`);
}

console.log('\n=== 2. route.ts와 동일 select (limit 미지정 → default 1000) ===');
{
  const { data } = await sb
    .from('apt_representative_price')
    .select('apt_nm, umd_nm, lawd_cd, area_group, trade_count, median_amount, window_used, last_deal_date');
  console.log(`반환된 행: ${data?.length ?? 0}`);
  const banpo = (data ?? []).filter(r => r.apt_nm === '반포자이');
  console.log(`그 중 "반포자이": ${banpo.length}건`);
  for (const r of banpo) {
    console.log(`  ${r.apt_nm} ${r.area_group}㎡대 평균 ${(r.median_amount/10000).toFixed(1)}억`);
  }
}

console.log('\n=== 3. limit 명시적으로 50000 ===');
{
  const { data } = await sb
    .from('apt_representative_price')
    .select('apt_nm, umd_nm, lawd_cd, area_group, trade_count, median_amount, window_used, last_deal_date')
    .limit(50000);
  console.log(`반환된 행: ${data?.length ?? 0}`);
  const banpo = (data ?? []).filter(r => r.apt_nm === '반포자이');
  console.log(`그 중 "반포자이": ${banpo.length}건`);
  for (const r of banpo) {
    console.log(`  ${r.apt_nm} ${r.area_group}㎡대 평균 ${(r.median_amount/10000).toFixed(1)}억`);
  }
}
