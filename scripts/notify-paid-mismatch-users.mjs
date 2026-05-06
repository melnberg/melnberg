// A (닉네임 mismatch) + B (카페 미등록) 6명에게 admin_notice 알림 발송
// 알림 type: 'admin_notice' (이미 notifications 테이블 check 에 있음)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes('--apply');
console.log(`[mode] ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

// A: 닉네임 mismatch
const A_USERS = [
  { naver_id: 'keseol',   site_nick: 'keseol04',  cafe_nick: '팡팡' },
  { naver_id: 'berry6419', site_nick: 'berry6419', cafe_nick: '공인강남맨' },
];

// B: 카페 명부 미등록
const B_USERS = [
  { naver_id: 'lebron23',     site_nick: '10억파이어' },
  { naver_id: 'taga111',      site_nick: '잘살자' },
  { naver_id: 'jeonghwa',     site_nick: 'skwjdghk' },
  { naver_id: 'lsilverbell',  site_nick: '양념통닭' },
];

async function getId(nid) {
  const { data } = await sb.from('profiles').select('id').eq('naver_id', nid).maybeSingle();
  return data?.id ?? null;
}

console.log('=== A) 닉네임 mismatch ===');
for (const u of A_USERS) {
  const id = await getId(u.naver_id);
  if (!id) { console.log(`  ⚠ ${u.naver_id}: profile 없음`); continue; }
  const msg = `네이버ID(${u.naver_id})는 카페 유료회원으로 확인됐어요. 다만 사이트 닉네임("${u.site_nick}")이 카페 닉네임("${u.cafe_nick}")과 달라 자동 등업이 안 됐어요. 마이페이지에서 닉네임을 "${u.cafe_nick}"으로 바꾸시면 자동으로 조합원 등업됩니다.`;
  console.log(`  → ${u.naver_id} ("${u.site_nick}"): ${msg.slice(0, 60)}...`);
  if (APPLY) {
    const { error } = await sb.from('notifications').insert({
      recipient_id: id,
      type: 'admin_notice',
      actor_name: '멜른버그 운영',
      comment_excerpt: msg,
    });
    if (error) console.log(`    ✗ ${error.message}`);
  }
}

console.log('\n=== B) 카페 명부에 naver_id 없음 ===');
for (const u of B_USERS) {
  const id = await getId(u.naver_id);
  if (!id) { console.log(`  ⚠ ${u.naver_id}: profile 없음`); continue; }
  const msg = `등록하신 네이버ID(${u.naver_id})가 카페 유료회원 명부에 없어 자동 등업이 안 됐어요. 1) 카페에서 다른 ID로 가입했거나 2) 명부 누락일 수 있어요. 카페에서 사용 중인 정확한 네이버ID를 마이페이지에서 입력해주세요.`;
  console.log(`  → ${u.naver_id} ("${u.site_nick}"): ${msg.slice(0, 60)}...`);
  if (APPLY) {
    const { error } = await sb.from('notifications').insert({
      recipient_id: id,
      type: 'admin_notice',
      actor_name: '멜른버그 운영',
      comment_excerpt: msg,
    });
    if (error) console.log(`    ✗ ${error.message}`);
  }
}

console.log(`\n${APPLY ? '발송 완료' : '--apply 추가 시 실제 발송'}.`);
