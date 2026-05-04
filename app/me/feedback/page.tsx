import { redirect } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export const metadata = { title: '내 건의사항 — 멜른버그' };
export const dynamic = 'force-dynamic';

type Row = {
  id: number;
  message: string;
  page_url: string | null;
  created_at: string;
  admin_reply: string | null;
  replied_at: string | null;
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default async function MyFeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/me/feedback');

  const supabase = await createClient();
  const { data } = await supabase
    .from('feedback')
    .select('id, message, page_url, created_at, admin_reply, replied_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  const items = (data ?? []) as Row[];

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/me', label: '마이페이지' },
        { href: '/me/feedback', label: '내 건의사항', bold: true },
      ]} meta="My Feedback" />

      <section className="py-12">
        <div className="max-w-[680px] mx-auto px-6">
          <div className="flex items-baseline justify-between mb-2 gap-3">
            <h1 className="text-[28px] font-bold text-navy tracking-tight">내 건의사항</h1>
            <Link href="/me" className="text-[12px] font-bold text-navy hover:text-cyan no-underline tracking-wider uppercase">← 마이페이지</Link>
          </div>
          <p className="text-sm text-muted mb-8">위젯으로 보낸 내 건의사항 + 관리자 답글.</p>

          {items.length === 0 ? (
            <div className="text-center py-20 text-muted text-[14px]">
              아직 보낸 건의사항이 없습니다.<br />
              <span className="text-[12px]">우측 하단 말풍선으로 의견 남겨주세요.</span>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((r) => (
                <li key={r.id} className="border border-border bg-white px-5 py-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] text-muted">{fmtDate(r.created_at)}</span>
                    {r.admin_reply ? (
                      <span className="text-[10px] font-bold tracking-wider uppercase bg-cyan/15 text-cyan px-1.5 py-0.5">답글 도착</span>
                    ) : (
                      <span className="text-[10px] text-muted">답변 대기 중</span>
                    )}
                  </div>
                  <p className="text-[14px] text-text whitespace-pre-wrap leading-relaxed break-words">{r.message}</p>
                  {r.page_url && (
                    <div className="text-[11px] text-muted truncate mt-1">📍 {r.page_url}</div>
                  )}
                  {r.admin_reply && (
                    <div className="mt-3 pt-3 border-t border-[#e5e7eb] bg-navy-soft px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-navy">관리자 답글</span>
                        {r.replied_at && <span className="text-[10px] text-muted">{fmtDate(r.replied_at)}</span>}
                      </div>
                      <p className="text-[13px] text-text whitespace-pre-wrap leading-relaxed">{r.admin_reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Layout>
  );
}
