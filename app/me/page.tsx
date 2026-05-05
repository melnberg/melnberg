import Link from 'next/link';
import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import LogoutButton from '@/components/LogoutButton';
import ProfileForm from '@/components/ProfileForm';
import DeleteAccountButton from '@/components/DeleteAccountButton';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile, getCurrentScore, getCurrentMlbgBalance } from '@/lib/auth';
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
    balance,
    payments,
    { count: aptPostCount },
    { count: aptCommentCount },
    { count: communityPostCount },
    { count: communityCommentCount },
    { data: ownedAptsData },
  ] = await Promise.all([
    getCurrentProfile(),
    getCurrentScore(),
    getCurrentMlbgBalance(),
    listOwnPayments(),
    supabase.from('apt_discussions').select('id', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
    supabase.from('apt_discussion_comments').select('id', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', user.id),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('author_id', user.id),
    supabase.from('apt_master_with_listing')
      .select('id, apt_nm, dong, lawd_cd, listing_price, occupied_at')
      .eq('occupier_id', user.id)
      .order('occupied_at', { ascending: false }),
  ]);
  const ownedApts = (ownedAptsData ?? []) as Array<{
    id: number; apt_nm: string; dong: string | null; lawd_cd: string | null;
    listing_price: number | string | null; occupied_at: string | null;
  }>;

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
              <Stat label="mlbg 잔액" value={String(balance)} accent border />
            </div>
            <div className="mt-3 px-4 py-3 border border-border bg-navy-soft text-[11px] leading-relaxed">
              <div className="text-navy font-bold mb-1.5 tracking-wider uppercase text-[10px]">mlbg 적립 기준 (AI 평가)</div>
              <p className="text-text mb-2">
                글·댓글을 작성하면 <b className="text-navy">AI 가 정보가치를 판단</b>해 기준 mlbg 의 <b className="text-navy">0.1배 ~ 1.5배</b> 사이로 차등 지급함.
              </p>
              <ul className="space-y-0.5 text-text">
                <li>· 커뮤니티 글 <b className="text-navy">2 mlbg</b> 기준 → 실제 <span className="text-muted">0.2 ~ 3.0</span></li>
                <li>· 커뮤니티 댓글 <b className="text-navy">0.3 mlbg</b> 기준 → 실제 <span className="text-muted">0.03 ~ 0.45</span></li>
                <li>· 아파트글 <b className="text-navy">1 mlbg</b> 기준 → 실제 <span className="text-muted">0.1 ~ 1.5</span></li>
                <li>· 아파트 댓글 <b className="text-navy">0.5 mlbg</b> 기준 → 실제 <span className="text-muted">0.05 ~ 0.75</span></li>
              </ul>
              <div className="mt-2 pt-2 border-t border-navy/15">
                <div className="text-navy font-bold text-[10px] tracking-wider uppercase mb-1">평가 가이드</div>
                <ul className="space-y-0.5 text-muted">
                  <li>· <b className="text-red-600">0.1 ~ 0.3배</b> — 의미없음·스팸·한두 단어·이모지·단순반복</li>
                  <li>· <b>0.4 ~ 0.7배</b> — 단순 의견·짧은 감상</li>
                  <li>· <b>0.8 ~ 1.0배</b> — 정보가 어느 정도 있음 (기본값)</li>
                  <li>· <b>1.1 ~ 1.3배</b> — 구체적 정보·경험 공유</li>
                  <li>· <b className="text-cyan">1.4 ~ 1.5배</b> — 정성있는 분석·정보가 풍부</li>
                </ul>
                <p className="text-muted mt-1.5 text-[10px]">길이만 길고 내용 빈약하면 점수 낮춤. 짧아도 정보가치 높으면 점수 높임. <b>같은 글·댓글 반복 작성은 거의 적립되지 않음.</b></p>
              </div>
              <p className="text-muted mt-2 pt-2 border-t border-navy/15">단지 분양·매매 시 사용되는 화폐 단위입니다. 누적 적립 점수: <b>{score}</b></p>
            </div>
          </div>

          {/* 보유 단지 */}
          <div className="mt-10">
            <h2 className="text-[15px] font-bold text-navy mb-3">
              보유 단지 <span className="text-muted text-[12px] font-semibold">{ownedApts.length}개</span>
            </h2>
            {ownedApts.length === 0 ? (
              <p className="text-[13px] text-muted py-6 px-5 border border-border text-center leading-relaxed">
                보유한 단지가 없습니다.<br/>
                <span className="text-[11px]">홈 지도에서 단지를 분양받거나 매물을 매수해보세요.</span>
              </p>
            ) : (
              <ul className="border border-border">
                {ownedApts.map((a) => {
                  const lp = a.listing_price == null ? null : Number(a.listing_price);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border last:border-b-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-text truncate">{a.apt_nm}</div>
                        <div className="text-[11px] text-muted mt-0.5">
                          {a.dong ?? ''}
                          {a.occupied_at && ` · 분양 ${new Date(a.occupied_at).toLocaleDateString('ko-KR')}`}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {lp != null ? (
                          <>
                            <div className="text-[12px] font-bold text-cyan tabular-nums">{lp.toLocaleString()} mlbg</div>
                            <div className="text-[10px] font-bold tracking-widest uppercase text-cyan mt-0.5">매물 등록</div>
                          </>
                        ) : (
                          <div className="text-[10px] font-bold tracking-widest uppercase text-muted">보유중</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
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
