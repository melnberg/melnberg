import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import ResetPasswordForm from '@/components/ResetPasswordForm';

export const metadata = { title: '비밀번호 재설정 — 멜른버그' };
export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/reset-password', label: '비밀번호 재설정', bold: true },
      ]} meta="Reset" />
      <section className="py-12">
        <div className="max-w-[420px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">비밀번호 재설정</h1>
          <p className="text-sm text-muted mb-8">새 비밀번호를 입력해주세요.</p>
          <ResetPasswordForm />
        </div>
      </section>
    </Layout>
  );
}
