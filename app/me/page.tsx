import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import LogoutButton from '@/components/LogoutButton';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '마이페이지 — 멜른버그' };

export default async function MePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/me');

  const displayName = (user.user_metadata?.display_name as string | undefined) ?? user.email;

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/me', label: '마이페이지', bold: true }]} meta="Account" />

      <section className="py-12">
        <div className="max-w-[680px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">마이페이지</h1>
          <p className="text-sm text-muted mb-8">계정 정보를 확인합니다.</p>

          <div className="border border-border">
            <Row label="이름" value={displayName ?? '-'} />
            <Row label="이메일" value={user.email ?? '-'} />
            <Row label="가입일" value={user.created_at ? new Date(user.created_at).toLocaleDateString('ko-KR') : '-'} />
            <Row label="회원 등급" value="무료회원" badge />
          </div>

          <div className="mt-6 flex justify-end">
            <LogoutButton />
          </div>
        </div>
      </section>

      <Footer />
    </Layout>
  );
}

function Row({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-border last:border-b-0">
      <span className="text-[12px] font-bold tracking-widest uppercase text-muted">{label}</span>
      {badge ? (
        <span className="text-[11px] font-bold tracking-wider uppercase bg-navy-soft text-navy px-3 py-1">{value}</span>
      ) : (
        <span className="text-[14px] text-text">{value}</span>
      )}
    </div>
  );
}
