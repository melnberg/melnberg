import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import FindAccountForm from '@/components/FindAccountForm';

export const metadata = { title: '계정 찾기 — 멜른버그' };
export const dynamic = 'force-dynamic';

export default function FindAccountPage() {
  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/login', label: '로그인' },
        { href: '/find-account', label: '계정 찾기', bold: true },
      ]} meta="Account" />
      <section className="py-12">
        <div className="max-w-[420px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">계정 찾기</h1>
          <p className="text-sm text-muted mb-8">아이디(이메일) 찾기 또는 비밀번호 재설정.</p>
          <FindAccountForm />
        </div>
      </section>
    </Layout>
  );
}
