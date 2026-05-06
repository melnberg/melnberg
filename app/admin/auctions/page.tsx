import { redirect } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import AdminAuctionForm from '@/components/AdminAuctionForm';
import TelegramResendButton from '@/components/TelegramResendButton';
import Countdown from '@/components/Countdown';
import AdminAuctionRowActions from '@/components/AdminAuctionRowActions';
import { createClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/community';

export const metadata = { title: '시한 경매 관리 — 멜른버그' };
export const dynamic = 'force-dynamic';

type AuctionRow = {
  id: number;
  asset_type: 'apt' | 'factory' | 'emart' | null;
  asset_id: number | null;
  asset_name: string | null;
  apt_id: number | null;     // 백워드 호환
  apt_nm: string | null;     // 백워드 호환
  starts_at: string; ends_at: string;
  min_bid: number; current_bid: number | null; current_bidder_name: string | null;
  status: string; bid_count: number;
};

const ASSET_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  apt:     { label: '단지',   cls: 'bg-navy text-white' },
  factory: { label: '시설',   cls: 'bg-cyan text-white' },
  emart:   { label: '이마트', cls: 'bg-[#F5A623] text-white' },
};

export default async function AdminAuctionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/auctions');
  if (!(await isCurrentUserAdmin())) redirect('/');

  // 2026-05-06: 시한 경매 일시 비활성. 새 경매 등록 폼 비활성, 기존 데이터는 조회용으로만 표시.
  const { data } = await supabase.rpc('list_recent_auctions', { p_limit: 50 }).then((r) => r, () => ({ data: null }));
  const rows = (data ?? []) as AuctionRow[];
  const isDisabled = true;

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/admin', label: '어드민' },
        { href: '/admin/auctions', label: '시한 경매', bold: true },
      ]} meta="Auctions Admin" />

      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">시한 경매 관리</h1>
          <p className="text-sm text-muted mb-6">단지 ID 입력하면 즉시 경매 시작. 종료 5분 전 입찰 시 자동 연장.</p>

          {isDisabled ? (
            <div className="border-2 border-[#dc2626] bg-[#fef2f2] px-6 py-5 mb-10">
              <h2 className="text-[14px] font-bold text-[#dc2626] mb-2">⚠ 시한 경매 일시 비활성화 (2026-05-06)</h2>
              <p className="text-[12px] text-[#7f1d1d] leading-relaxed">
                안정화 작업으로 새 경매 등록을 막아둠. 기존 경매 데이터는 아래 표에서 조회만 가능.<br />
                재오픈하려면 app/admin/auctions/page.tsx 의 isDisabled 를 false 로 + Sidebar 메뉴 주석 해제.
              </p>
            </div>
          ) : (
            <div className="border border-border bg-bg/30 px-6 py-5 mb-10">
              <h2 className="text-[14px] font-bold text-navy mb-3">새 경매 등록</h2>
              <AdminAuctionForm />
            </div>
          )}

          <h2 className="text-[16px] font-bold text-navy mb-3">전체 경매 ({rows.length}건)</h2>
          {rows.length === 0 ? (
            <p className="text-[13px] text-muted py-8 text-center border border-border">아직 등록된 경매 없음.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-bg/60 border-y border-navy text-muted">
                    <th className="py-2 px-2 font-semibold text-left w-12">ID</th>
                    <th className="py-2 px-2 font-semibold text-center w-16">타입</th>
                    <th className="py-2 px-2 font-semibold text-left">자산명</th>
                    <th className="py-2 px-2 font-semibold text-center w-24">상태</th>
                    <th className="py-2 px-2 font-semibold text-center w-24">시작가</th>
                    <th className="py-2 px-2 font-semibold text-center w-32">현재가</th>
                    <th className="py-2 px-2 font-semibold text-center w-28">입찰</th>
                    <th className="py-2 px-2 font-semibold text-center w-40">종료 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const tBadge = ASSET_TYPE_BADGE[a.asset_type ?? 'apt'] ?? ASSET_TYPE_BADGE.apt;
                    const displayName = a.asset_name ?? a.apt_nm ?? '자산';
                    return (
                    <tr key={a.id} className="border-b border-border hover:bg-bg/40">
                      <td className="py-1.5 px-2 tabular-nums">{a.id}</td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={`text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 ${tBadge.cls}`}>{tBadge.label}</span>
                      </td>
                      <td className="py-1.5 px-2"><Link href={`/auctions/${a.id}`} className="font-bold text-navy hover:underline">{displayName}</Link></td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={`text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 ${
                          a.status === 'active' ? 'bg-[#dc2626] text-white' :
                          a.status === 'completed' ? 'bg-cyan text-navy' :
                          'bg-[#e5e5e5] text-muted'
                        }`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-center tabular-nums">{Number(a.min_bid).toLocaleString()}</td>
                      <td className="py-1.5 px-2 text-center tabular-nums">
                        {a.current_bid != null ? Number(a.current_bid).toLocaleString() : '—'}
                        {a.current_bidder_name && <div className="text-[10px] text-muted">{a.current_bidder_name}</div>}
                      </td>
                      <td className="py-1.5 px-2 text-center tabular-nums">{a.bid_count}</td>
                      <td className="py-1.5 px-2 text-center tabular-nums">
                        {a.status === 'active' ? (
                          <span className="text-[#dc2626] font-bold"><Countdown endsAt={a.ends_at} /></span>
                        ) : (
                          <span className="text-muted text-[11px]">
                            {new Date(a.ends_at).toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {a.status === 'active' && (
                          <div className="inline-flex flex-col gap-1 items-end">
                            <TelegramResendButton auctionId={a.id} />
                            <AdminAuctionRowActions
                              auctionId={a.id}
                              endsAt={a.ends_at}
                              minBid={Number(a.min_bid)}
                              bidCount={a.bid_count}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
