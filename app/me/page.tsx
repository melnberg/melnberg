import Link from 'next/link';
import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import LogoutButton from '@/components/LogoutButton';
import NicknameEditor from '@/components/NicknameEditor';
import NaverIdEditor from '@/components/NaverIdEditor';
import LinkUrlEditor from '@/components/LinkUrlEditor';
import DeleteAccountButton from '@/components/DeleteAccountButton';
import { createClient } from '@/lib/supabase/server';
import { listOwnPayments, tierLabelKo, isActivePaid, formatExpiry } from '@/lib/tier';
import { paymentStatusLabel } from '@/lib/tier-utils';

export const metadata = { title: '마이페이지 — 멜른버그' };

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/me');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, tier, tier_expires_at, is_admin, naver_id, link_url')
    .eq('id', user.id)
    .maybeSingle();

  const displayName =
    profile?.display_name ??
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split('@')[0] ??
    '회원';

  const tier = (profile?.tier ?? 'free') as 'free' | 'paid';
  const expiresAt = profile?.tier_expires_at ?? null;
  const isActive = isActivePaid({ tier, tier_expires_at: expiresAt });
  const tierBadge = isActive ? '조합원' : tierLabelKo(tier);

  const payments = await listOwnPayments();

  // 활동 통계 — 작성글·댓글·score
  const [{ count: postCount }, { count: commentCount }, { data: scoreData }] = await Promise.all([
    supabase.from('apt_discussions').select('id', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
    supabase.from('apt_discussion_comments').select('id', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
    supabase.rpc('get_user_score', { p_user_id: user.id }),
  ]);
  const score = typeof scoreData === 'number' ? scoreData : Number(scoreData ?? 0);

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/me', label: '마이페이지', bold: true }]} meta="Account" />

      <section className="py-12">
        <div className="max-w-[680px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">마이페이지</h1>
          <p className="text-sm text-muted mb-8">계정 정보를 확인합니다.</p>

          <div className="border border-border">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <span className="text-[12px] font-bold tracking-widest uppercase text-muted">닉네임</span>
              <NicknameEditor initial={displayName} />
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <span className="text-[12px] font-bold tracking-widest uppercase text-muted">네이버 ID<br/><span className="text-[10px] normal-case font-medium text-muted">카페 유료회원 인증</span></span>
              <NaverIdEditor initial={profile?.naver_id ?? null} />
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <span className="text-[12px] font-bold tracking-widest uppercase text-muted">블로그·SNS<br/><span className="text-[10px] normal-case font-medium text-muted">닉네임 클릭 시 연결</span></span>
              <LinkUrlEditor initial={(profile as { link_url?: string | null } | null)?.link_url ?? null} />
            </div>
            <Row label="이메일" value={user.email ?? '-'} />
            <Row label="가입일" value={user.created_at ? new Date(user.created_at).toLocaleDateString('ko-KR') : '-'} />
            <Row label="회원 등급" value={tierBadge} badge tone={isActive ? 'cyan' : 'muted'} />
            {isActive && (
              <Row label="만료일" value={formatExpiry(expiresAt)} />
            )}
          </div>

          {/* 활동 통계 */}
          <div className="mt-8">
            <h2 className="text-[15px] font-bold text-navy mb-3">활동</h2>
            <div className="grid grid-cols-3 border border-border">
              <Stat label="작성글" value={(postCount ?? 0).toLocaleString()} suffix="개" />
              <Stat label="댓글" value={(commentCount ?? 0).toLocaleString()} suffix="개" border />
              <Stat label="Score" value={String(score)} accent border />
            </div>
            <p className="text-[11px] text-muted mt-2">Score = 작성글 1점 + 댓글 0.7점. 단지 점거·강제집행 시 사용됩니다.</p>
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

          <div className="mt-10 flex items-center justify-between">
            {profile?.is_admin && (
              <Link href="/admin" className="text-[13px] font-bold text-navy no-underline hover:underline">
                어드민 페이지 →
              </Link>
            )}
            <div className="ml-auto">
              <LogoutButton />
            </div>
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
