// 반포자이 데이터 진단
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== 1. apt_trades 전체에서 반포자이 검색 ===');
{
  const { data, count } = await sb
    .from('apt_trades')
    .select('apt_nm, dong, exclu_use_ar, floor, deal_year, deal_month, deal_day, deal_amount, deal_type, cancel_deal_type', { count: 'exact' })
    .ilike('apt_nm', '%반포자이%')
    .order('deal_year', { ascending: false })
    .order('deal_month', { ascending: false })
    .order('deal_day', { ascending: false })
    .limit(15);
  console.log(`전체 매치: ${count}건. 최근 15건:`);
  for (const r of (data ?? [])) {
    const eok = (r.deal_amount / 10000).toFixed(1);
    console.log(`  ${r.apt_nm} ${r.dong} ${r.exclu_use_ar}㎡ ${r.floor}층  ${eok}억  ${r.deal_year}-${String(r.deal_month).padStart(2,'0')}-${String(r.deal_day).padStart(2,'0')}  ${r.deal_type ?? '-'}  ${r.cancel_deal_type || '정상'}`);
  }
}

console.log('\n=== 2. apt_representative_price view 에서 반포자이 ===');
{
  const { data } = await sb
    .from('apt_representative_price')
    .select('apt_nm, umd_nm, area_group, trade_count, median_amount, window_used, last_deal_date')
    .ilike('apt_nm', '%반포자이%')
    .order('area_group');
  console.log(`매칭: ${data?.length ?? 0}개`);
  for (const r of (data ?? [])) {
    console.log(`  ${r.apt_nm} ${r.area_group}㎡대  평균 ${(r.median_amount/10000).toFixed(1)}억 (${r.trade_count}건, ${r.window_used})`);
  }
}

console.log('\n=== 3. 60㎡ 부근 반포자이 평형 분포 ===');
{
  const { data } = await sb
    .from('apt_trades')
    .select('exclu_use_ar')
    .ilike('apt_nm', '%반포자이%');
  const buckets = {};
  for (const r of (data ?? [])) {
    const b = Math.floor(r.exclu_use_ar / 5) * 5;
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  const sorted = Object.entries(buckets).sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [b, c] of sorted) console.log(`  ${b}~${Number(b)+5}㎡대: ${c}건`);
}

console.log('\n=== 4. 24평형(전용 59㎡대) 반포자이 거래 — 최근 13개월 ===');
{
  const { data } = await sb
    .from('apt_trades')
    .select('apt_nm, exclu_use_ar, floor, deal_year, deal_month, deal_day, deal_amount, deal_type, cancel_deal_type')
    .ilike('apt_nm', '%반포자이%')
    .gte('exclu_use_ar', 55)
    .lt('exclu_use_ar', 65)
    .order('deal_year', { ascending: false })
    .order('deal_month', { ascending: false })
    .order('deal_day', { ascending: false })
    .limit(15);
  console.log(`전용 55~65㎡ 반포자이: ${data?.length ?? 0}건`);
  for (const r of (data ?? [])) {
    const eok = (r.deal_amount / 10000).toFixed(1);
    console.log(`  ${r.apt_nm}  ${r.exclu_use_ar}㎡ ${r.floor}층  ${eok}억  ${r.deal_year}-${String(r.deal_month).padStart(2,'0')}-${String(r.deal_day).padStart(2,'0')}  ${r.deal_type ?? '-'}  ${r.cancel_deal_type || '정상'}`);
  }
}
