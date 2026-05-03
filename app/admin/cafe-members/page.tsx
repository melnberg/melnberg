import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import CafeMembersAdmin from '@/components/CafeMembersAdmin';
import { createClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/community';

export const metadata = { title: '카페 유료회원 관리 — 멜른버그' };
export const dynamic = 'force-dynamic';

export default async function CafeMembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/cafe-members');
  if (!(await isCurrentUserAdmin())) redirect('/');

  // 전체 명부 (페이지네이션 — PostgREST max-rows 1000 우회)
  const all: Array<{ naver_id: string; cafe_nickname: string | null; registered_at: string; note: string | null }> = [];
  for (let off = 0; off < 50000; off += 1000) {
    const { data } = await supabase
      .from('cafe_paid_members')
      .select('naver_id, cafe_nickname, registered_at, note')
      .order('registered_at', { ascending: false })
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    all.push(...(data as Array<{ naver_id: string; cafe_nickname: string | null; registered_at: string; note: string | null }>));
    if (data.length < 1000) break;
  }
  const members = all;
  const count = all.length;

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/admin', label: '어드민' },
        { href: '/admin/cafe-members', label: '카페 유료회원', bold: true },
      ]} meta="Members" />

      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">카페 유료회원 명부</h1>
          <p className="text-sm text-muted mb-8">
            네이버ID 매칭으로 가입자 자동 정회원 처리. 총 <b>{count ?? 0}</b>명.
          </p>

          <CafeMembersAdmin initialMembers={members} />
        </div>
      </section>
    </Layout>
  );
}
