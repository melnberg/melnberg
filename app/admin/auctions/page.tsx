import { redirect } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import AdminAuctionForm from '@/components/AdminAuctionForm';
import TelegramResendButton from '@/components/TelegramResendButton';
import { createClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/community';

export const metadata = { title: '시한 경매 관리 — 멜른버그' };
export const dynamic = 'force-dynamic';

type AuctionRow = {
  id: number; apt_id: number; apt_nm: string | null;
  starts_at: string; ends_at: string;
  min_bid: number; current_bid: number | null; current_bidder_name: string | null;
  status: string; bid_count: number;
};

export default async function AdminAuctionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/auctions');
  if (!(await isCurrentUserAdmin())) redirect('/');

  await supabase.rpc('complete_expired_auctions').then((r) => r, () => null);
  const { data } = await supabase.rpc('list_recent_auctions', { p_limit: 50 }).then((r) => r, () => ({ data: null }));
  const rows = (data ?? []) as AuctionRow[];

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

          <div className="border border-border bg-bg/30 px-6 py-5 mb-10">
            <h2 className="text-[14px] font-bold text-navy mb-3">새 경매 등록</h2>
            <AdminAuctionForm />
          </div>

          <h2 className="text-[16px] font-bold text-navy mb-3">전체 경매 ({rows.length}건)</h2>
          {rows.length === 0 ? (
            <p className="text-[13px] text-muted py-8 text-center border border-border">아직 등록된 경매 없음.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-bg/60 border-y border-navy text-muted">
                    <th className="py-2 px-2 font-semibold text-left w-12">ID</th>
                    <th className="py-2 px-2 font-semibold text-left">단지</th>
                    <th className="py-2 px-2 font-semibold text-center w-24">상태</th>
                    <th className="py-2 px-2 font-semibold text-center w-24">시작가</th>
                    <th className="py-2 px-2 font-semibold text-center w-32">현재가</th>
                    <th className="py-2 px-2 font-semibold text-center w-28">입찰</th>
                    <th className="py-2 px-2 font-semibold text-center w-40">종료 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-b border-border hover:bg-bg/40">
                      <td className="py-1.5 px-2 tabular-nums">{a.id}</td>
                      <td className="py-1.5 px-2"><Link href={`/auctions/${a.id}`} className="font-bold text-navy hover:underline">{a.apt_nm ?? '단지'}</Link></td>
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
                      <td className="py-1.5 px-2 text-center text-muted tabular-nums">
                        {new Date(a.ends_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {a.status === 'active' && <TelegramResendButton auctionId={a.id} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
