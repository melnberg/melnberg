import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import AuctionBidForm from '@/components/AuctionBidForm';
import AuctionCommentSection from '@/components/AuctionCommentSection';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 만료 경매 처리는 /api/cron/complete-auctions (5분 cron) 으로 분리됨 (death spiral 방지, 2026-05-06).
// 이 페이지에서 inline 호출 금지.

type Auction = {
  id: number; apt_id: number | null;
  asset_type: 'apt' | 'factory' | 'emart';
  asset_id: number;
  starts_at: string; ends_at: string;
  min_bid: number; current_bid: number | null;
  current_bidder_id: string | null;
  status: 'active' | 'completed' | 'cancelled';
  bid_count: number;
};

type Bid = {
  id: number; bidder_id: string; amount: number; created_at: string;
};

const FACTORY_BRAND_LABEL: Record<string, string> = {
  hynix: 'SK하이닉스', samsung: '삼성전자', costco: '코스트코',
  union: '금속노조', cargo: '화물연대', terminal: '터미널', station: '기차역',
};

type AssetInfo = { name: string; sub: string | null; typeBadge: string };

export default async function AuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = createPublicClient();

  const [{ data: auc }, { data: bidRows }] = await Promise.all([
    supabase.from('apt_auctions').select('id, apt_id, asset_type, asset_id, starts_at, ends_at, min_bid, current_bid, current_bidder_id, status, bid_count').eq('id', numId).maybeSingle(),
    supabase.from('auction_bids').select('id, bidder_id, amount, created_at').eq('auction_id', numId).order('created_at', { ascending: false }).limit(20),
  ]);

  if (!auc) notFound();
  const auction = auc as unknown as Auction;

  // 자산 타입별 정보 fetch
  let asset: AssetInfo = { name: '경매 자산', sub: null, typeBadge: '자산' };
  if (auction.asset_type === 'apt') {
    const { data: apt } = await supabase
      .from('apt_master')
      .select('apt_nm, dong, household_count')
      .eq('id', auction.asset_id)
      .maybeSingle();
    const a = apt as { apt_nm?: string | null; dong?: string | null; household_count?: number | null } | null;
    asset = {
      name: a?.apt_nm ?? '단지',
      sub: [a?.dong, a?.household_count ? `${Number(a.household_count).toLocaleString()}세대` : null].filter(Boolean).join(' · ') || null,
      typeBadge: '단지',
    };
  } else if (auction.asset_type === 'factory') {
    const { data: f } = await supabase
      .from('factory_locations')
      .select('name, brand, address, occupy_price')
      .eq('id', auction.asset_id)
      .maybeSingle();
    const r = f as { name?: string | null; brand?: string | null; address?: string | null; occupy_price?: number | null } | null;
    asset = {
      name: r?.name ?? '시설',
      sub: r?.address ?? null,
      typeBadge: FACTORY_BRAND_LABEL[r?.brand ?? ''] ?? '시설',
    };
  } else if (auction.asset_type === 'emart') {
    const { data: e } = await supabase
      .from('emart_locations')
      .select('name, address')
      .eq('id', auction.asset_id)
      .maybeSingle();
    const r = e as { name?: string | null; address?: string | null } | null;
    asset = { name: r?.name ?? '이마트', sub: r?.address ?? null, typeBadge: '이마트' };
  }
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
  let currentUserName: string | null = null;
  if (user) {
    const { data: prof } = await userClient.from('profiles').select('mlbg_balance, display_name').eq('id', user.id).maybeSingle();
    const p = prof as { mlbg_balance?: number | null; display_name?: string | null } | null;
    myBalance = p ? Number(p.mlbg_balance ?? 0) : 0;
    currentUserName = p?.display_name ?? null;
  }

  const isActive = auction.status === 'active';

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/auctions', label: '시한 경매' },
        { label: asset.name, bold: true },
      ]} meta="Auction" />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          {/* 헤더 */}
          <div className="mb-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-[10px] font-bold tracking-widest uppercase bg-cyan/15 text-cyan px-2 py-1">{asset.typeBadge}</span>
              <h1 className="text-[24px] font-bold text-navy tracking-tight">{asset.name}</h1>
              <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-1 ${
                isActive ? 'bg-[#dc2626] text-white' : 'bg-[#e5e5e5] text-muted'
              }`}>
                {isActive ? 'LIVE 🔴' : auction.status === 'completed' ? '낙찰 완료' : '유찰'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[12px] text-muted flex-wrap">
              {asset.sub && <span>{asset.sub}</span>}
              <span>입찰 {auction.bid_count}건</span>
            </div>
          </div>

          {/* 현재가 + 카운트다운 + 입찰 */}
          <AuctionBidForm
            auctionId={auction.id}
            initialStartsAt={auction.starts_at}
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

          {/* 경매 채팅 — 입찰자/관전자 댓글 + 0.5 mlbg 보상 */}
          <AuctionCommentSection
            auctionId={auction.id}
            currentUserId={user?.id ?? null}
            currentUserName={currentUserName}
          />
        </div>
      </section>
    </Layout>
  );
}
