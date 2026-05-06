// 자동등업 트리거 (063) 가 5명에게 안 탔던 원인 디버깅
// 1) 트리거가 DB 에 살아있는지
// 2) 함수 정의 현재 버전이 무엇인지 (063 vs 029)
// 3) 5명 케이스의 시간 패턴

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== 1) profiles 트리거 확인 ===');
// pg_trigger / pg_proc 직접 조회는 권한 필요 → SQL Editor 에서 돌려야 함
console.log('Supabase SQL Editor 에서 다음 쿼리 실행:');
console.log(`
  -- profiles 테이블 트리거 목록
  select t.tgname, p.proname, t.tgenabled
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.profiles'::regclass
      and not t.tgisinternal
    order by t.tgname;

  -- auto_paid_on_profile_naver_id 함수 정의 (063 버전인지)
  select prosrc from pg_proc where proname = 'auto_paid_on_profile_naver_id';

  -- cafe_paid_members 트리거 (028/029)
  select t.tgname, p.proname
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.cafe_paid_members'::regclass
      and not t.tgisinternal;
`);

console.log('\n=== 2) 5명의 created_at 시점 vs 카페 명부 ===');
const TARGETS = ['lawliet7777', 'sjs9123', 'ryuga97', 'kjwmika', 'zapzal'];
const profs = [];
for (const nid of TARGETS) {
  const { data } = await sb.from('profiles').select('id, display_name, naver_id, created_at, tier, tier_expires_at').eq('naver_id', nid).maybeSingle();
  if (data) profs.push(data);
}
const cafeAll = [];
for (const nid of TARGETS) {
  const { data } = await sb.from('cafe_paid_members').select('naver_id, cafe_nickname, registered_at').eq('naver_id', nid).maybeSingle();
  if (data) cafeAll.push(data);
}

const cafeMap = new Map(cafeAll.map((c) => [c.naver_id, c]));
for (const p of profs) {
  const c = cafeMap.get(p.naver_id);
  const profCreated = new Date(p.created_at).getTime();
  const cafeRegistered = c ? new Date(c.registered_at).getTime() : 0;
  const diffDays = c ? Math.round((cafeRegistered - profCreated) / 86400000) : null;
  console.log(`◆ ${p.naver_id} ("${p.display_name}")`);
  console.log(`   profile.created_at:   ${p.created_at}`);
  console.log(`   cafe.registered_at:   ${c?.registered_at ?? '—'}`);
  if (diffDays != null) {
    if (diffDays > 0) console.log(`   → 카페 등록이 사이트 가입보다 ${diffDays}일 늦음 (063 트리거 fire 시점엔 매칭 row 없었음)`);
    else if (diffDays < 0) console.log(`   → 카페 등록이 사이트 가입보다 ${-diffDays}일 빠름 (handle_new_user 동작했어야 — 닉네임/공백 mismatch 가능)`);
    else console.log(`   → 같은 날 등록 (race)`);
  }
  console.log(`   현재 tier: ${p.tier} (expires ${p.tier_expires_at})`);
  console.log('');
}

console.log('=== 3) 진단 결론 가설 ===');
console.log('가장 흔한 원인:');
console.log('  A) 카페 명부 INSERT 가 먼저 + 사이트 가입 시 닉네임 다름 → handle_new_user 매칭 실패 → free');
console.log('  B) 사이트 가입 먼저 + 카페 등록 나중 → 029 트리거 fire 됐으나 그 시점 닉네임 다름 → free');
console.log('  C) 어드민이 cafe_paid_members 에 service_role 우회 INSERT → 트리거 안 탔을 수 있음');
console.log('');
console.log('현재 모두 닉네임 정확히 일치하는 상태인 것은 본인이 닉네임 변경했거나 어드민이 카페 명부 정정한 결과일 듯.');
console.log('해결: 063 트리거가 profile UPDATE of naver_id 만 fire 하므로,');
console.log('      display_name 변경에도 재매칭하는 트리거가 있어야 함 (049 가 있지만 강등만 함).');
