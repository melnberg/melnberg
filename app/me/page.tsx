import Link from 'next/link';
import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import LogoutButton from '@/components/LogoutButton';
import ProfileForm from '@/components/ProfileForm';
import DeleteAccountButton from '@/components/DeleteAccountButton';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile, getCurrentScore } from '@/lib/auth';
import { listOwnPayments, tierLabelKo, isActivePaid, formatExpiry } from '@/lib/tier';
import { paymentStatusLabel } from '@/lib/tier-utils';

export const metadata = { title: '마이페이지 — 멜른버그' };

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/me');

  const supabase = await createClient();

  // 한 번에 다 병렬 — Layout 이 이미 호출한 user/profile/score 는 cached 라 재사용됨
  const [
    profile,
    score,
    payments,
    { count: aptPostCount },
    { count: aptCommentCount },
    { count: communityPostCount },
    { count: communityCommentCount },
  ] = await Promise.all([
    getCurrentProfile(),
    getCurrentScore(),
    listOwnPayments(),
    supabase.from('apt_discussions').select('id', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
    supabase.from('apt_discussion_comments').select('id', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', user.id),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('author_id', user.id),
  ]);

  const displayName =
    profile?.display_name ??
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split('@')[0] ??
    '회원';

  const tier = (profile?.tier ?? 'free') as 'free' | 'paid';
  const expiresAt = profile?.tier_expires_at ?? null;
  const isActive = isActivePaid({ tier, tier_expires_at: expiresAt });
  const tierBadge = isActive ? '조합원' : tierLabelKo(tier);

  const aptPosts = aptPostCount ?? 0;
  const communityPosts = communityPostCount ?? 0;
  const aptComments = aptCommentCount ?? 0;
  const communityComments = communityCommentCount ?? 0;
  const totalComments = aptComments + communityComments;

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/me', label: '마이페이지', bold: true }]} meta="Account" />

      <section className="py-12">
        <div className="max-w-[680px] mx-auto px-6">
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-2">
            <h1 className="text-[28px] font-bold text-navy tracking-tight">마이페이지</h1>
            <div className="flex items-center gap-2">
              <Link
                href="/me/feedback"
                className="px-3 py-1.5 border border-border bg-white text-text text-[12px] font-bold no-underline hover:border-navy hover:text-navy"
              >
                내 건의사항
              </Link>
              {profile?.is_admin && (
                <Link
                  href="/admin"
                  className="px-3 py-1.5 border border-navy bg-navy text-white text-[12px] font-bold no-underline hover:bg-navy-dark"
                >
                  어드민 페이지
                </Link>
              )}
            </div>
          </div>
          <p className="text-sm text-muted mb-8">계정 정보를 확인합니다.</p>

          <ProfileForm
            initial={{
              display_name: displayName,
              naver_id: profile?.naver_id ?? null,
              link_url: profile?.link_url ?? null,
              is_solo: !!profile?.is_solo,
              bio: profile?.bio ?? '',
              avatar_url: profile?.avatar_url ?? null,
            }}
            email={user.email ?? '-'}
            isPaid={isActive}
          />

          <div className="mt-6 border border-border">
            <Row label="가입일" value={user.created_at ? new Date(user.created_at).toLocaleDateString('ko-KR') : '-'} />
            <Row label="회원 등급" value={tierBadge} badge tone={isActive ? 'cyan' : 'muted'} />
            {isActive && (
              <Row label="만료일" value={formatExpiry(expiresAt)} />
            )}
          </div>

          {/* 활동 통계 */}
          <div className="mt-8">
            <h2 className="text-[15px] font-bold text-navy mb-3">활동</h2>
            <div className="grid grid-cols-4 border border-border">
              <Stat label="게시글" value={communityPosts.toLocaleString()} suffix="개" />
              <Stat label="아파트글" value={aptPosts.toLocaleString()} suffix="개" border />
              <Stat label="댓글" value={totalComments.toLocaleString()} suffix="개" border />
              <Stat label="mlbg" value={String(score)} accent border />
            </div>
            <div className="mt-3 px-4 py-3 border border-border bg-navy-soft text-[11px] leading-relaxed">
              <div className="text-navy font-bold mb-1.5 tracking-wider uppercase text-[10px]">mlbg 적립 기준</div>
              <ul className="space-y-0.5 text-text">
                <li>· 커뮤니티 글 <b className="text-navy">2 mlbg</b> / 커뮤니티 댓글 <b className="text-navy">0.3 mlbg</b></li>
                <li>· 아파트글 <b className="text-navy">1 mlbg</b> / 아파트 댓글 <b className="text-navy">0.5 mlbg</b></li>
              </ul>
              <p className="text-muted mt-1.5">단지 분양·매매 시 사용되는 화폐 단위입니다.</p>
            </div>
          </div>

          {/* 결제 내역 */}
          <div className="mt-10">
            <h2 className="text-[15px] font-bold text-navy mb-3">결제 내역</h2>
            {payments.length === 0 ? (
              <p className="text-[13px] text-muted py-6 px-5 border border-border text-center">
                결제 내역이 없습니다.
              </p>
            ) : (
              <ul className="border border-border">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-text">{p.product_name}</div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {new Date(p.paid_at).toLocaleString('ko-KR')}
                        {p.tier_period_label && ` · ${p.tier_period_label}`}
                        {p.pg_provider && ` · ${p.pg_provider}`}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[13px] font-bold tabular-nums">{p.amount.toLocaleString('ko-KR')}원</div>
                      <div className={`text-[10px] font-bold tracking-widest uppercase mt-0.5 ${
                        p.status === 'paid' ? 'text-cyan' : p.status === 'submitted' ? 'text-navy' : 'text-muted'
                      }`}>
                        {paymentStatusLabel(p.status)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-10 flex items-center justify-end">
            <LogoutButton />
          </div>

          <div className="mt-12 pt-6 border-t border-border flex justify-end">
            <DeleteAccountButton />
          </div>
        </div>
      </section>

    </Layout>
  );
}

function Stat({ label, value, suffix, accent, border }: { label: string; value: string; suffix?: string; accent?: boolean; border?: boolean }) {
  return (
    <div className={`px-5 py-4 ${border ? 'border-l border-border' : ''}`}>
      <div className="text-[11px] font-bold tracking-widest uppercase text-muted">{label}</div>
      <div className={`text-[22px] font-bold mt-1 tabular-nums ${accent ? 'text-cyan' : 'text-navy'}`}>
        {value}
        {suffix && <span className="text-[13px] text-muted ml-1 font-normal">{suffix}</span>}
      </div>
    </div>
  );
}

function Row({ label, value, badge, tone }: { label: string; value: string; badge?: boolean; tone?: 'cyan' | 'muted' }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-border last:border-b-0">
      <span className="text-[12px] font-bold tracking-widest uppercase text-muted">{label}</span>
      {badge ? (
        <span
          className={`text-[11px] font-bold tracking-wider uppercase px-3 py-1 ${
            tone === 'cyan' ? 'bg-cyan text-navy' : 'bg-navy-soft text-navy'
          }`}
        >
          {value}
        </span>
      ) : (
        <span className="text-[14px] text-text">{value}</span>
      )}
    </div>
  );
}
