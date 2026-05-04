// 030/032 적용 여부 + 김럭키가이 score 검증
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== 1. posts.view_count 컬럼 존재 여부 (SQL 030) ===');
{
  const { data, error } = await sb.from('posts').select('id, view_count').limit(3);
  if (error) console.log('  ✗ 컬럼 없음. SQL 030 미적용:', error.message);
  else console.log('  ✓ 존재. 샘플:', data);
}

console.log('\n=== 2. increment_post_view RPC ===');
{
  const { data, error } = await sb.rpc('increment_post_view', { p_post_id: 1 });
  if (error) console.log('  ✗ RPC 없음. SQL 030 미적용:', error.message);
  else console.log('  ✓ RPC 있음. 글 1번 view_count =', data);
}

console.log('\n=== 3. 김럭키가이 score (SQL 032 미적용 시 = apt 토론만 셈) ===');
{
  const { data: prof } = await sb.from('profiles').select('id, display_name').eq('display_name', '김럭키가이').maybeSingle();
  if (!prof) { console.log('  김럭키가이 프로필 없음'); }
  else {
    const { data: score } = await sb.rpc('get_user_score', { p_user_id: prof.id });
    const { count: postCount } = await sb.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', prof.id);
    const { count: aptDisCount } = await sb.from('apt_discussions').select('*', { count: 'exact', head: true }).eq('author_id', prof.id);
    console.log(`  현재 score = ${score}`);
    console.log(`  posts 작성수 = ${postCount}, apt_discussions 작성수 = ${aptDisCount}`);
    console.log(`  → posts가 score에 반영되려면 SQL 032 필요`);
  }
}

console.log('\n=== 4. 최근 posts.created_at 분석 (KST 환산) ===');
{
  const { data } = await sb.from('posts').select('id, title, created_at').order('created_at', { ascending: false }).limit(3);
  for (const p of (data ?? [])) {
    const utc = p.created_at;
    const kst = new Date(p.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    console.log(`  #${p.id} "${p.title}"`);
    console.log(`    UTC: ${utc}`);
    console.log(`    KST: ${kst}`);
  }
}
