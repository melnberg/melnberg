import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import SignupForm from '@/components/SignupForm';

export const metadata = {
  title: '회원가입 — 멜른버그',
  description: '멜른버그 회원가입',
};

export default function SignupPage() {
  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/signup', label: '회원가입', bold: true }]} meta="Sign Up" />

      <section className="py-16">
        <div className="max-w-[420px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">회원가입</h1>
          <p className="text-sm text-muted mb-8">멜른버그 계정을 만듭니다.</p>
          <SignupForm />
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
