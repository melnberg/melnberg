import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import { listPosts, formatRelativeKo } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: '커뮤니티 — 멜른버그',
  description: '멜른버그 회원 커뮤니티',
};

export const dynamic = 'force-dynamic';

export default async function CommunityPage() {
  const posts = await listPosts();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <Layout current="community">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/community', label: '커뮤니티', bold: true }]} meta="Community" />

      <section className="pt-14 pb-6 border-b border-border">
        <div className="max-w-content mx-auto px-10">
          <div className="flex items-center justify-between gap-4 pb-3 border-b-2 border-navy">
            <h1 className="text-[32px] font-bold text-navy tracking-tight">커뮤니티</h1>
            {user && (
              <Link
                href="/community/new"
                className="bg-navy text-white px-5 py-2.5 text-[13px] font-bold tracking-wider no-underline hover:bg-navy-dark"
              >
                글쓰기 →
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-content mx-auto px-10">
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted text-[15px] mb-6">아직 게시된 글이 없습니다.</p>
              {user ? (
                <Link href="/community/new" className="inline-block bg-navy text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-navy-dark">
                  첫 글 쓰기 →
                </Link>
              ) : (
                <Link href="/login?next=/community/new" className="inline-block border-2 border-navy text-navy px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-navy hover:text-white">
                  로그인하고 글쓰기
                </Link>
              )}
            </div>
          ) : (
            <ul className="border-t border-border">
              {posts.map((p) => (
                <li key={p.id} className="border-b border-border">
                  <Link href={`/community/${p.id}`} className="flex items-start gap-4 px-2 py-5 no-underline hover:bg-bg/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold text-text mb-1 break-keep line-clamp-2">{p.title}</h2>
                      <p className="text-[13px] text-muted leading-relaxed line-clamp-2 break-keep">{p.content}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted tracking-wide">
                        <span className="font-semibold text-navy">{p.author?.display_name ?? '익명'}</span>
                        <span>·</span>
                        <span>{formatRelativeKo(p.created_at)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
