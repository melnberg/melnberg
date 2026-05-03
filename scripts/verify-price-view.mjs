// 017 view 검증: window_used 분포 + 도곡렉슬·신현대11차 등 시세 비교
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('\n=== 1. window_used 분포 (전체 단지·평형 행 수) ===');
{
  const { data, error } = await supabase
    .from('apt_representative_price')
    .select('window_used');
  if (error) { console.error(error); }
  else {
    const counts = {};
    for (const r of data) counts[r.window_used] = (counts[r.window_used] ?? 0) + 1;
    console.log(counts);
    console.log(`전체: ${data.length}행`);
  }
}

console.log('\n=== 2. 도곡렉슬 시세 (평형별) ===');
{
  const { data } = await supabase
    .from('apt_representative_price')
    .select('apt_nm, umd_nm, area_group, trade_count, median_amount, min_amount, max_amount, window_used, last_deal_date')
    .eq('apt_nm', '도곡렉슬')
    .order('area_group');
  for (const r of (data ?? [])) {
    const eok = (n) => (n / 10000).toFixed(2);
    console.log(`  ${r.area_group}㎡대  평균 ${eok(r.median_amount)}억 (min ${eok(r.min_amount)} ~ max ${eok(r.max_amount)}, ${r.trade_count}건, ${r.window_used}, 마지막 ${r.last_deal_date})`);
  }
}

console.log('\n=== 3. 압구정동 상위 10개 (단지·평형) ===');
{
  const { data } = await supabase
    .from('apt_representative_price')
    .select('apt_nm, umd_nm, area_group, trade_count, median_amount, window_used')
    .eq('umd_nm', '압구정동')
    .order('median_amount', { ascending: false })
    .limit(10);
  for (const r of (data ?? [])) {
    const eok = (r.median_amount / 10000).toFixed(1);
    console.log(`  ${r.apt_nm} ${r.area_group}㎡대  ${eok}억 (${r.trade_count}건, ${r.window_used})`);
  }
}

console.log('\n=== 4. 12억대 단지 (강남 11680 시세) ===');
{
  const { data } = await supabase
    .from('apt_representative_price')
    .select('apt_nm, umd_nm, area_group, median_amount, window_used, trade_count')
    .eq('lawd_cd', '11680')
    .gte('median_amount', 110000)
    .lte('median_amount', 130000)
    .order('median_amount')
    .limit(10);
  console.log(`매칭: ${data?.length ?? 0}개`);
  for (const r of (data ?? [])) {
    const eok = (r.median_amount / 10000).toFixed(1);
    console.log(`  ${r.apt_nm} (${r.umd_nm}) ${r.area_group}㎡대  ${eok}억 (${r.window_used}, ${r.trade_count}건)`);
  }
}

console.log('\n=== 5. 12억대 단지 (1호선 시군구 — 종로/중구/동대문/성북/도봉/노원/구로/영등포/금천) ===');
{
  const lawd1 = ['11110', '11140', '11230', '11290', '11320', '11350', '11530', '11560', '11545'];
  const { data } = await supabase
    .from('apt_representative_price')
    .select('apt_nm, umd_nm, lawd_cd, area_group, median_amount, window_used, trade_count')
    .in('lawd_cd', lawd1)
    .gte('median_amount', 110000)
    .lte('median_amount', 130000)
    .order('median_amount')
    .limit(15);
  console.log(`매칭: ${data?.length ?? 0}개`);
  for (const r of (data ?? [])) {
    const eok = (r.median_amount / 10000).toFixed(1);
    console.log(`  [${r.lawd_cd}] ${r.apt_nm} (${r.umd_nm}) ${r.area_group}㎡대  ${eok}억 (${r.window_used}, ${r.trade_count}건)`);
  }
}
