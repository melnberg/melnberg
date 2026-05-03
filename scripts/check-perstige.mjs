// 반포 래미안퍼스티지 데이터 진단
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== 1. apt_trades에서 "퍼스티지" / "래미안" 매칭 ===');
{
  const { data, count } = await sb
    .from('apt_trades')
    .select('apt_nm, dong, exclu_use_ar, deal_year, deal_month, deal_day, deal_amount', { count: 'exact' })
    .ilike('apt_nm', '%퍼스티지%')
    .order('deal_year', { ascending: false })
    .order('deal_month', { ascending: false })
    .order('deal_day', { ascending: false })
    .limit(10);
  console.log(`"퍼스티지" 매치: ${count}건. 최근 10건:`);
  for (const r of (data ?? [])) {
    const eok = (r.deal_amount / 10000).toFixed(1);
    console.log(`  ${r.apt_nm} (${r.dong}) ${r.exclu_use_ar}㎡ ${eok}억 ${r.deal_year}-${String(r.deal_month).padStart(2,'0')}-${String(r.deal_day).padStart(2,'0')}`);
  }
}

console.log('\n=== 2. 반포동 단지명 distinct 목록 (래미안 계열만) ===');
{
  const { data } = await sb
    .from('apt_trades')
    .select('apt_nm')
    .eq('dong', '반포동')
    .ilike('apt_nm', '%래미안%')
    .limit(500);
  const uniq = new Set((data ?? []).map(r => r.apt_nm));
  console.log(`반포동 "래미안" 포함 단지명 ${uniq.size}종:`);
  for (const n of [...uniq].sort()) console.log(`  - "${n}"`);
}

console.log('\n=== 3. apt_representative_price view에서 퍼스티지 ===');
{
  const { data } = await sb
    .from('apt_representative_price')
    .select('apt_nm, umd_nm, area_group, trade_count, median_amount, window_used, last_deal_date')
    .ilike('apt_nm', '%퍼스티지%')
    .order('area_group');
  console.log(`view 매칭: ${data?.length ?? 0}개`);
  for (const r of (data ?? [])) {
    console.log(`  ${r.apt_nm} (${r.umd_nm}) ${r.area_group}㎡대 평균 ${(r.median_amount/10000).toFixed(1)}억 (${r.trade_count}건, ${r.window_used}, 마지막 ${r.last_deal_date})`);
  }
}

console.log('\n=== 4. 84~87㎡대(24~26평) 퍼스티지 최근 거래 ===');
{
  const { data } = await sb
    .from('apt_trades')
    .select('apt_nm, exclu_use_ar, floor, deal_year, deal_month, deal_day, deal_amount, cancel_deal_type')
    .ilike('apt_nm', '%퍼스티지%')
    .gte('exclu_use_ar', 80)
    .lt('exclu_use_ar', 95)
    .order('deal_year', { ascending: false })
    .order('deal_month', { ascending: false })
    .order('deal_day', { ascending: false })
    .limit(15);
  console.log(`80~95㎡ 퍼스티지: ${data?.length ?? 0}건`);
  for (const r of (data ?? [])) {
    const eok = (r.deal_amount / 10000).toFixed(1);
    console.log(`  "${r.apt_nm}" ${r.exclu_use_ar}㎡ ${r.floor}층 ${eok}억 ${r.deal_year}-${String(r.deal_month).padStart(2,'0')}-${String(r.deal_day).padStart(2,'0')} ${r.cancel_deal_type || '정상'}`);
  }
}

console.log('\n=== 5. "반포래미안"이라는 정확한 문자열은 어디 있나? ===');
{
  const { data, count } = await sb
    .from('apt_trades')
    .select('apt_nm', { count: 'exact', head: false })
    .ilike('apt_nm', '%반포래미안%')
    .limit(20);
  console.log(`"반포래미안" 매치: ${count}건`);
  const uniq = new Set((data ?? []).map(r => r.apt_nm));
  for (const n of uniq) console.log(`  - "${n}"`);
}
