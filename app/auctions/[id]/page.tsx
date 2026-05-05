import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import AuctionBidForm from '@/components/AuctionBidForm';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Auction = {
  id: number; apt_id: number;
  starts_at: string; ends_at: string;
  min_bid: number; current_bid: number | null;
  current_bidder_id: string | null;
  status: 'active' | 'completed' | 'cancelled';
  bid_count: number;
};

type Bid = {
  id: number; bidder_id: string; amount: number; created_at: string;
};

export default async function AuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = createPublicClient();
  // 만료된 경매 자동 종료 (각 페이지 진입마다 한 번)
  await supabase.rpc('complete_expired_auctions').then((r) => r, () => null);

  const [{ data: auc }, { data: aptRow }, { data: bidRows }] = await Promise.all([
    supabase.from('apt_auctions').select('id, apt_id, starts_at, ends_at, min_bid, current_bid, current_bidder_id, status, bid_count').eq('id', numId).maybeSingle(),
    supabase.from('apt_master').select('id, apt_nm, dong, lawd_cd, household_count, kapt_build_year').eq('id', numId).maybeSingle().then(async (r) => {
      // 위 쿼리는 임시 — apt_id 가 numId 와 다를 수 있으니 두 번째 fetch
      return r;
    }),
    supabase.from('auction_bids').select('id, bidder_id, amount, created_at').eq('auction_id', numId).order('created_at', { ascending: false }).limit(20),
  ]);

  if (!auc) notFound();
  const auction = auc as unknown as Auction;
  // apt 정보를 정확한 apt_id 로 다시 fetch
  const { data: apt } = await supabase
    .from('apt_master')
    .select('id, apt_nm, dong, lawd_cd, household_count, kapt_build_year')
    .eq('id', auction.apt_id)
    .maybeSingle();
  // 최근 입찰자 닉네임 조회
  const bidderIds = Array.from(new Set([
    auction.current_bidder_id,
    ...((bidRows ?? []) as Bid[]).map((b) => b.bidder_id),
  ].filter(Boolean) as string[]));
  const nameMap = new Map<string, string>();
  if (bidderIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', bidderIds);
    for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (p.display_name) nameMap.set(p.id, p.display_name);
    }
  }
  // 현재 사용자 + 잔액
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  let myBalance: number | null = null;
  if (user) {
    const { data: prof } = await userClient.from('profiles').select('mlbg_balance').eq('id', user.id).maybeSingle();
    myBalance = prof ? Number((prof as { mlbg_balance?: number | null }).mlbg_balance ?? 0) : 0;
  }

  const isActive = auction.status === 'active';
  const aptName = (apt as { apt_nm?: string | null } | null)?.apt_nm ?? '단지';

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/auctions', label: '시한 경매' },
        { label: aptName, bold: true },
      ]} meta="Auction" />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          {/* 헤더 */}
          <div className="mb-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-[24px] font-bold text-navy tracking-tight">{aptName}</h1>
              <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-1 ${
                isActive ? 'bg-[#dc2626] text-white' : 'bg-[#e5e5e5] text-muted'
              }`}>
                {isActive ? 'LIVE 🔴' : auction.status === 'completed' ? '낙찰 완료' : '유찰'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[12px] text-muted flex-wrap">
              {(apt as { dong?: string | null } | null)?.dong && <span>{(apt as { dong?: string | null }).dong}</span>}
              {(apt as { household_count?: number | null } | null)?.household_count && (
                <span>{Number((apt as { household_count?: number }).household_count).toLocaleString()}세대</span>
              )}
              <span>입찰 {auction.bid_count}건</span>
            </div>
          </div>

          {/* 현재가 + 카운트다운 + 입찰 */}
          <AuctionBidForm
            auctionId={auction.id}
            initialEndsAt={auction.ends_at}
            initialCurrentBid={auction.current_bid}
            initialCurrentBidderName={auction.current_bidder_id ? (nameMap.get(auction.current_bidder_id) ?? '익명') : null}
            minBid={Number(auction.min_bid)}
            initialBidCount={auction.bid_count}
            isActive={isActive}
            isLoggedIn={!!user}
            myBalance={myBalance}
          />

          {/* 최근 입찰 내역 */}
          <section className="mt-10">
            <h2 className="text-[14px] font-bold text-navy mb-2 pb-2 border-b-2 border-navy">최근 입찰</h2>
            {(bidRows ?? []).length === 0 ? (
              <p className="text-[13px] text-muted py-6 text-center">아직 입찰 없음. 첫 입찰자가 되어보세요.</p>
            ) : (
              <ul>
                {((bidRows ?? []) as Bid[]).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0">
                    <span className="text-[13px] font-bold text-text">{nameMap.get(b.bidder_id) ?? '익명'}</span>
                    <span className="text-[13px] tabular-nums text-navy font-bold">{Number(b.amount).toLocaleString()} mlbg</span>
                    <span className="text-[10px] text-muted tabular-nums">
                      {new Date(b.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </Layout>
  );
}
