import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata = { title: '시한 경매 — 멜른버그' };
export const dynamic = 'force-dynamic';

type AuctionRow = {
  id: number; apt_id: number; apt_nm: string | null;
  starts_at: string; ends_at: string;
  min_bid: number; current_bid: number | null; current_bidder_name: string | null;
  status: 'active' | 'completed' | 'cancelled'; bid_count: number;
};

export default async function AuctionsPage() {
  const supabase = createPublicClient();
  // 만료 경매 자동 종료 처리 (페이지 로드 시 한 번)
  await supabase.rpc('complete_expired_auctions').then((r) => r, () => null);
  const { data } = await supabase.rpc('list_recent_auctions', { p_limit: 50 }).then((r) => r, () => ({ data: null }));
  const rows = (data ?? []) as AuctionRow[];
  const active = rows.filter((r) => r.status === 'active');
  const ended = rows.filter((r) => r.status !== 'active');

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/auctions', label: '시한 경매', bold: true }]} meta="Auctions" />
      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">시한 경매</h1>
          <p className="text-sm text-muted mb-8">어드민이 등록한 단지를 시한 경매로. 종료 5분 전 입찰 시 +5분 자동 연장.</p>

          {active.length > 0 && (
            <section className="mb-12">
              <h2 className="text-[18px] font-bold text-navy mb-3">진행 중 ({active.length})</h2>
              <ul className="grid gap-2">
                {active.map((a) => (
                  <li key={a.id}>
                    <Link href={`/auctions/${a.id}`} className="block border border-[#dc2626]/40 bg-[#fef2f2] hover:bg-[#fee2e2] hover:border-[#dc2626] px-5 py-4 no-underline">
                      <div className="flex items-baseline justify-between gap-4 flex-wrap">
                        <div className="text-[16px] font-bold text-navy truncate flex-1">{a.apt_nm ?? '단지'}</div>
                        <div className="text-[12px] font-bold text-[#dc2626] tracking-widest uppercase">LIVE 🔴</div>
                      </div>
                      <div className="flex items-baseline justify-between gap-4 flex-wrap mt-2 text-[12px]">
                        <div>
                          <span className="text-muted">현재 최고가</span>{' '}
                          <span className="text-navy font-bold tabular-nums">
                            {a.current_bid != null ? `${Number(a.current_bid).toLocaleString()} mlbg` : `시작가 ${Number(a.min_bid).toLocaleString()}`}
                          </span>
                          {a.current_bidder_name && <span className="text-muted ml-2">· {a.current_bidder_name} 님</span>}
                        </div>
                        <div className="text-muted tabular-nums">
                          종료 {new Date(a.ends_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' })}
                          <span className="ml-2 text-[#dc2626] font-bold">입찰 {a.bid_count}건</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ended.length > 0 && (
            <section>
              <h2 className="text-[18px] font-bold text-navy mb-3">최근 종료</h2>
              <ul className="grid gap-1.5">
                {ended.map((a) => (
                  <li key={a.id}>
                    <Link href={`/auctions/${a.id}`} className="block border border-border bg-white hover:bg-bg/40 px-5 py-3 no-underline">
                      <div className="flex items-baseline justify-between gap-4 flex-wrap">
                        <div className="text-[14px] font-bold text-text truncate flex-1">{a.apt_nm ?? '단지'}</div>
                        <div className="text-[10px] text-muted tracking-widest uppercase">{a.status === 'completed' ? 'COMPLETED' : 'CANCELLED'}</div>
                      </div>
                      <div className="text-[11px] text-muted mt-1">
                        {a.current_bid != null ? `${Number(a.current_bid).toLocaleString()} mlbg` : '입찰 없음'}
                        {a.current_bidder_name && a.status === 'completed' && <span> · 낙찰 {a.current_bidder_name} 님</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {rows.length === 0 && (
            <div className="text-[13px] text-muted text-center py-12 border border-border">아직 등록된 경매 없음.</div>
          )}
        </div>
      </section>
    </Layout>
  );
}
