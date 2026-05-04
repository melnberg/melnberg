// 땅부자 등업 안 되는 원인 진단
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const NICK = '땅부자';

console.log(`=== 1. cafe_paid_members에 '${NICK}' 닉네임으로 등록 여부 ===`);
{
  const { data } = await sb
    .from('cafe_paid_members')
    .select('naver_id, cafe_nickname, registered_at, note')
    .ilike('cafe_nickname', `%${NICK}%`);
  console.log(`매치 ${data?.length ?? 0}건`);
  for (const r of (data ?? [])) {
    console.log(`  naver_id="${r.naver_id}"  cafe_nickname="${r.cafe_nickname}"  ${r.registered_at?.slice(0,10)}`);
  }
}

console.log(`\n=== 2. profiles에 display_name='${NICK}' 가입자 ===`);
{
  const { data } = await sb
    .from('profiles')
    .select('id, naver_id, display_name, tier, created_at')
    .ilike('display_name', `%${NICK}%`);
  console.log(`매치 ${data?.length ?? 0}건`);
  for (const r of (data ?? [])) {
    console.log(`  id=${r.id?.slice(0,8)}  naver_id="${r.naver_id}"  display_name="${r.display_name}"  tier=${r.tier}  ${r.created_at?.slice(0,10)}`);
  }
}

console.log(`\n=== 3. 매칭 점검 ===`);
{
  const { data: cafe } = await sb
    .from('cafe_paid_members')
    .select('naver_id, cafe_nickname')
    .ilike('cafe_nickname', `%${NICK}%`);
  const { data: prof } = await sb
    .from('profiles')
    .select('id, naver_id, display_name, tier')
    .ilike('display_name', `%${NICK}%`);

  if (!cafe?.length) { console.log('  [원인A] 카페 명부에 닉네임 없음 → 명부 추가 필요'); }
  if (!prof?.length) { console.log('  [원인B] 사이트 가입 자체를 안 함'); }

  if (cafe?.length && prof?.length) {
    for (const p of prof) {
      const matchByNaverId = cafe.find((c) => c.naver_id === p.naver_id);
      console.log(`  사이트 가입자 "${p.display_name}" (naver_id="${p.naver_id}")`);
      if (!p.naver_id) console.log(`    → naver_id 비어있음. 네이버 OAuth로 로그인 안 했음.`);
      else if (!matchByNaverId) console.log(`    → 명부에 동일한 naver_id 없음. 다른 네이버계정으로 가입한 듯.`);
      else if (matchByNaverId.cafe_nickname !== p.display_name) {
        console.log(`    → naver_id는 매치되나 닉네임 불일치. cafe="${matchByNaverId.cafe_nickname}" vs site="${p.display_name}"`);
      } else {
        console.log(`    → 완전매치인데 tier=${p.tier}. 트리거 누락 의심.`);
      }
    }
  }
}
