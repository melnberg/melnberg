// 땅부자 naver_id 정정 → 트리거가 자동 paid 전환
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: before } = await sb
  .from('profiles')
  .select('id, naver_id, display_name, tier')
  .eq('display_name', '땅부자');
console.log('수정 전:', before);

const { error } = await sb
  .from('profiles')
  .update({ naver_id: 'rok22222' })
  .eq('display_name', '땅부자');
if (error) { console.error('실패:', error); process.exit(1); }

// sync_cafe_paid_tier RPC 호출 (있으면) 또는 수동 paid 전환
const { error: tierErr } = await sb
  .from('profiles')
  .update({ tier: 'paid' })
  .eq('display_name', '땅부자');
if (tierErr) console.warn('tier 수동 전환 실패:', tierErr);

const { data: after } = await sb
  .from('profiles')
  .select('id, naver_id, display_name, tier')
  .eq('display_name', '땅부자');
console.log('수정 후:', after);
