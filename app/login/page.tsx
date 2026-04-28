import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import LoginForm from '@/components/LoginForm';

export const metadata = {
  title: '로그인 — 멜른버그',
  description: '멜른버그 로그인',
};

export default function LoginPage() {
  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/login', label: '로그인', bold: true }]} meta="Login" />

      <section className="py-16">
        <div className="max-w-[420px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">로그인</h1>
          <p className="text-sm text-muted mb-8">멜른버그에 다시 오신 것을 환영합니다.</p>
          <LoginForm />
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
