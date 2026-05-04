import { redirect } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { createClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/community';

export const metadata = { title: '건의사항 — 어드민' };
export const dynamic = 'force-dynamic';

type FeedbackRow = {
  id: number;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  message: string;
  user_agent: string | null;
  page_url: string | null;
  created_at: string;
  resolved_at: string | null;
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default async function AdminFeedbackPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/feedback');
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect('/');

  const { data, error } = await supabase
    .from('feedback')
    .select('id, user_id, display_name, email, message, user_agent, page_url, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const items = (data ?? []) as FeedbackRow[];
  const unresolvedCount = items.filter((r) => !r.resolved_at).length;

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/admin', label: '어드민' },
        { href: '/admin/feedback', label: '건의사항', bold: true },
      ]} meta="Feedback" />

      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
            <h1 className="text-[28px] font-bold text-navy tracking-tight">건의사항</h1>
            <Link href="/admin" className="text-[12px] font-bold text-navy hover:text-cyan no-underline tracking-wider uppercase">← 어드민</Link>
          </div>
          <p className="text-sm text-muted mb-8">우측 하단 위젯으로 받은 사용자 피드백. 미해결 {unresolvedCount}건 / 전체 {items.length}건.</p>

          {error && <div className="text-sm text-red-700 mb-4">{error.message}</div>}

          {items.length === 0 ? (
            <div className="text-center py-20 text-muted text-[14px]">아직 건의사항이 없습니다.</div>
          ) : (
            <ul className="space-y-3">
              {items.map((r) => (
                <li key={r.id} className={`border ${r.resolved_at ? 'border-border bg-[#fafafa] opacity-70' : 'border-navy/30 bg-white'} px-5 py-4`}>
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-navy">{r.display_name ?? '익명'}</span>
                      {r.email && <span className="text-[11px] text-muted">{r.email}</span>}
                      <span className="text-[11px] text-muted">·</span>
                      <span className="text-[11px] text-muted">{fmtDate(r.created_at)}</span>
                      {r.resolved_at && (
                        <span className="text-[10px] font-bold tracking-wider uppercase bg-cyan/15 text-cyan px-1.5 py-0.5">해결됨</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted tabular-nums">#{r.id}</span>
                  </div>
                  <p className="text-[14px] text-text whitespace-pre-wrap leading-relaxed mb-2 break-words">{r.message}</p>
                  {r.page_url && (
                    <div className="text-[11px] text-muted truncate">📍 {r.page_url}</div>
                  )}
                  {r.user_agent && (
                    <div className="text-[10px] text-muted truncate mt-0.5">UA: {r.user_agent}</div>
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
