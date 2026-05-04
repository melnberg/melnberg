// 특정 사용자들의 블로그/SNS 링크 강제 제거 + 안내 알림
// node scripts/clear-deadlinks.mjs

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TARGETS = ['불꽃슛', '라프로익쿼터캐스크'];
const MSG = '등록하신 블로그/SNS 링크가 정상 동작하지 않아 비웠습니다. 마이페이지에서 정확한 링크로 다시 등록해주세요.';

// 먼저 notifications 타입 constraint 에 'admin_notice' 추가 (idempotent)
console.log('1) admin_notice 타입 추가...');
{
  const { error } = await sb.rpc('exec_sql', { sql: '' }).catch(() => ({ error: 'no rpc' }));
  // exec_sql RPC 없으면 직접 SQL 실행 불가 — 사용자가 한 번 실행 필요
  if (error) {
    console.log('  (RPC 없음 — 아래 SQL 을 Supabase SQL Editor 에서 실행 필요:)');
    console.log(`  alter table public.notifications drop constraint if exists notifications_type_check;`);
    console.log(`  alter table public.notifications add constraint notifications_type_check`);
    console.log(`    check (type in ('community_comment','apt_comment','apt_evicted','feedback_reply','admin_notice'));`);
  }
}

console.log('\n2) 대상 사용자 조회...');
const { data: users, error: uErr } = await sb
  .from('profiles')
  .select('id, display_name, link_url')
  .in('display_name', TARGETS);
if (uErr) { console.error('조회 실패:', uErr.message); process.exit(1); }
if (!users || users.length === 0) { console.error('대상 사용자 없음.'); process.exit(1); }
for (const u of users) console.log(`  - ${u.display_name} (${u.id.slice(0, 8)}...) link=${u.link_url}`);

console.log('\n3) link_url 비우기...');
const ids = users.map((u) => u.id);
const { error: clearErr } = await sb.from('profiles').update({ link_url: null }).in('id', ids);
if (clearErr) { console.error('비우기 실패:', clearErr.message); process.exit(1); }
console.log(`  ✓ ${ids.length}명 link_url null 처리`);

console.log('\n4) 알림 생성...');
const rows = users.map((u) => ({
  recipient_id: u.id,
  type: 'admin_notice',
  comment_excerpt: MSG,
  actor_name: '관리자',
}));
const { error: nErr } = await sb.from('notifications').insert(rows);
if (nErr) {
  console.error('알림 생성 실패:', nErr.message);
  console.error('  → admin_notice 타입이 constraint 에 없을 가능성. 위 SQL 먼저 실행 후 재시도.');
  process.exit(1);
}
console.log(`  ✓ ${rows.length}건 알림 생성`);

console.log('\n완료.');
