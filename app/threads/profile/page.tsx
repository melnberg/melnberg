import Link from 'next/link';
import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import ThreadProfileForm from '@/components/ThreadProfileForm';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import { fetchThreadProfile } from '@/lib/thread-profile';

export const dynamic = 'force-dynamic';
export const metadata = { title: '일깃장 프로필 편집 — 멜른버그' };

export default async function ThreadProfileEditPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/threads/profile');

  const supabase = await createClient();
  const [mainProfile, threadProfile] = await Promise.all([
    getCurrentProfile(),
    fetchThreadProfile(supabase, user.id),
  ]);

  return (
    <Layout current="threads">
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/threads', label: '나의 일깃장' },
          { label: '프로필 편집', bold: true },
        ]}
        meta="Diary"
      />
      <div className="bg-[#fdf6e3] min-h-[calc(100vh-66px)]">
        <section className="py-8">
          <div className="max-w-[620px] mx-auto px-4">
            <div className="bg-[#fff8ec] border-2 border-[#e8d9b8] rounded-3xl p-6 shadow-[0_4px_24px_rgba(120,90,50,0.06)]">
              <div className="flex items-baseline justify-between gap-4 mb-3">
                <h1 className="text-[20px] font-bold text-[#5c4634] tracking-tight" style={{ fontFamily: 'serif' }}>일깃장 프로필</h1>
                <Link
                  href="/threads"
                  className="text-[12px] text-[#a07f5f] hover:text-[#5c4634] no-underline"
                >
                  ← 돌아가기
                </Link>
              </div>
              <p className="text-[12px] text-[#8a6f55] mb-5 leading-loose">
                메인 멜른버그 닉네임과 별개의, 일깃장용 별명·소개·테마색이야.<br/>
                비워두면 기본 프로필이 자동으로 들어가.
              </p>
              <ThreadProfileForm
                userId={user.id}
                initial={{
                  handle: threadProfile?.handle ?? '',
                  display_name: threadProfile?.display_name ?? '',
                  bio: threadProfile?.bio ?? '',
                  avatar_url: threadProfile?.avatar_url ?? null,
                  theme_color: threadProfile?.theme_color ?? null,
                }}
                fallback={{
                  display_name: mainProfile?.display_name ?? null,
                  avatar_url: mainProfile?.avatar_url ?? null,
                }}
              />
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
