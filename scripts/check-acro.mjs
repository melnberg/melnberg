// 아크로리버파크 데이터 진단
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== 1. apt_trades에서 "아크로" 매칭 단지명 ===');
{
  const { data } = await sb
    .from('apt_trades')
    .select('apt_nm, dong')
    .ilike('apt_nm', '%아크로%')
    .limit(2000);
  const uniq = new Map();
  for (const r of data ?? []) {
    const key = `${r.apt_nm}__${r.dong}`;
    uniq.set(key, (uniq.get(key) ?? 0) + 1);
  }
  console.log(`"아크로" 단지명 ${uniq.size}종:`);
  for (const [k, c] of [...uniq.entries()].sort((a,b)=>b[1]-a[1])) {
    console.log(`  - ${k.split('__')[0]} (${k.split('__')[1]}) — ${c}건`);
  }
}

console.log('\n=== 2. apt_representative_price view에서 아크로 ===');
{
  const { data } = await sb
    .from('apt_representative_price')
    .select('apt_nm, umd_nm, area_group, trade_count, median_amount, window_used, last_deal_date')
    .ilike('apt_nm', '%아크로%')
    .order('area_group');
  console.log(`view 매칭: ${data?.length ?? 0}개`);
  for (const r of (data ?? [])) {
    console.log(`  ${r.apt_nm} (${r.umd_nm}) ${r.area_group}㎡대 평균 ${(r.median_amount/10000).toFixed(1)}억 (${r.trade_count}건, ${r.window_used}, 마지막 ${r.last_deal_date})`);
  }
}

console.log('\n=== 3. 아크로리버파크 24평형(전용 84㎡대) 최근 거래 ===');
{
  const { data } = await sb
    .from('apt_trades')
    .select('apt_nm, exclu_use_ar, floor, deal_year, deal_month, deal_day, deal_amount, deal_type, cancel_deal_type')
    .ilike('apt_nm', '%아크로리버파크%')
    .gte('exclu_use_ar', 80)
    .lt('exclu_use_ar', 90)
    .order('deal_year', { ascending: false })
    .order('deal_month', { ascending: false })
    .order('deal_day', { ascending: false })
    .limit(20);
  console.log(`80~90㎡ 아크로리버파크: ${data?.length ?? 0}건`);
  for (const r of (data ?? [])) {
    const eok = (r.deal_amount / 10000).toFixed(1);
    console.log(`  "${r.apt_nm}" ${r.exclu_use_ar}㎡ ${r.floor}층 ${eok}억 ${r.deal_year}-${String(r.deal_month).padStart(2,'0')}-${String(r.deal_day).padStart(2,'0')} ${r.deal_type ?? '-'} ${r.cancel_deal_type || '정상'}`);
  }
}

console.log('\n=== 4. 카페에 "아크로리버파크" 언급된 글 수 ===');
{
  const { count } = await sb
    .from('cafe_posts')
    .select('id', { count: 'exact', head: true })
    .or('title.ilike.%아크로리버파크%,content.ilike.%아크로리버파크%');
  console.log(`아크로리버파크 언급 글: ${count}건`);
}
{
  const { count } = await sb
    .from('cafe_posts')
    .select('id', { count: 'exact', head: true })
    .or('title.ilike.%아크로%,content.ilike.%아크로%');
  console.log(`"아크로" 언급 글: ${count}건`);
}
