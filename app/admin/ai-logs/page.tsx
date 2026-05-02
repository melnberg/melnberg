import Link from 'next/link';
import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/community';

export const metadata = { title: 'AI 질문 로그 — 멜른버그' };
export const dynamic = 'force-dynamic';

type LogRow = {
  id: number;
  user_id: string | null;
  ip_address: string | null;
  asked_at: string;
  question: string | null;
  chunk_count: number | null;
  source_count: number | null;
};

type ProfileLite = { id: string; display_name: string | null };

export default async function AdminAiLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; limit?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/ai-logs');
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect('/');

  const sp = await searchParams;
  const filter = sp.filter ?? 'all'; // 'all' | 'no-result'
  const limit = Math.min(Number(sp.limit ?? 200) || 200, 1000);

  let query = supabase
    .from('ai_question_logs')
    .select('id, user_id, ip_address, asked_at, question, chunk_count, source_count', { count: 'exact' })
    .order('asked_at', { ascending: false })
    .limit(limit);

  if (filter === 'no-result') {
    query = query.or('chunk_count.eq.0,chunk_count.is.null');
  }

  const { data: rawLogs, count: totalCount } = await query;
  const logs = (rawLogs ?? []) as LogRow[];

  // user_id → display_name 매핑
  const userIds = Array.from(new Set(logs.map((l) => l.user_id).filter((x): x is string => !!x)));
  const profilesMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profilesRaw } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    for (const p of (profilesRaw ?? []) as ProfileLite[]) {
      profilesMap.set(p.id, p.display_name ?? p.id.slice(0, 8));
    }
  }

  // 오늘·어제 통계
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStart = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), -9));
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  const todayCount = logs.filter((l) => new Date(l.asked_at) >= todayStart).length;
  const yesterdayCount = logs.filter((l) => {
    const t = new Date(l.asked_at);
    return t >= yesterdayStart && t < todayStart;
  }).length;
  const noResultCount = logs.filter((l) => l.chunk_count === 0 || l.chunk_count === null).length;

  function fmtTime(iso: string) {
    const d = new Date(iso);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(kst.getUTCDate()).padStart(2, '0');
    const hh = String(kst.getUTCHours()).padStart(2, '0');
    const mi = String(kst.getUTCMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}`;
  }

  return (
    <Layout>
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/admin', label: '어드민' },
          { href: '/admin/ai-logs', label: 'AI 질문 로그', bold: true },
        ]}
        meta="AI Q&A · 사용 기록"
      />

      <section className="py-12">
        <div className="max-w-[1200px] mx-auto px-10">
          <div className="flex items-baseline justify-between mb-2">
            <h1 className="text-[28px] font-bold text-navy tracking-tight">AI 질문 로그</h1>
            <Link href="/admin" className="text-[12px] font-bold text-muted hover:text-navy no-underline">
              ← 어드민
            </Link>
          </div>
          <p className="text-sm text-muted mb-8">사용자가 던진 질문 기록. 자료없음 응답도 추적함.</p>

          {/* 통계 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <Stat label="전체 누적" value={totalCount ?? logs.length} suffix="건" />
            <Stat label="오늘" value={todayCount} suffix="건" highlight />
            <Stat label="어제" value={yesterdayCount} suffix="건" />
            <Stat label="자료없음" value={noResultCount} suffix="건" warn />
          </div>

          {/* 필터 */}
          <div className="flex gap-2 mb-4">
            <FilterTab href="/admin/ai-logs" active={filter === 'all'}>전체</FilterTab>
            <FilterTab href="/admin/ai-logs?filter=no-result" active={filter === 'no-result'}>자료없음만</FilterTab>
          </div>

          {/* 로그 테이블 */}
          {logs.length === 0 ? (
            <div className="border border-border bg-bg/40 px-5 py-8 text-center text-[13px] text-muted">
              {filter === 'no-result' ? '자료없음 질문이 없습니다.' : '아직 질문이 없습니다.'}
            </div>
          ) : (
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-bg/60 text-muted">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold tracking-wider uppercase text-[10px] whitespace-nowrap">시각</th>
                    <th className="text-left px-3 py-2 font-bold tracking-wider uppercase text-[10px] whitespace-nowrap">사용자</th>
                    <th className="text-left px-3 py-2 font-bold tracking-wider uppercase text-[10px]">질문</th>
                    <th className="text-right px-3 py-2 font-bold tracking-wider uppercase text-[10px] whitespace-nowrap">청크</th>
                    <th className="text-right px-3 py-2 font-bold tracking-wider uppercase text-[10px] whitespace-nowrap">출처</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const user = log.user_id ? (profilesMap.get(log.user_id) ?? log.user_id.slice(0, 8)) : null;
                    const noResult = log.chunk_count === 0 || log.chunk_count === null;
                    return (
                      <tr key={log.id} className="border-t border-border hover:bg-bg/40">
                        <td className="px-3 py-2 text-muted whitespace-nowrap tabular-nums">{fmtTime(log.asked_at)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {user ? (
                            <span className="text-navy font-bold">{user}</span>
                          ) : (
                            <span className="text-muted">IP {log.ip_address ?? '?'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text break-words max-w-[600px]">{log.question}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${noResult ? 'text-red-600 font-bold' : 'text-text'}`}>
                          {log.chunk_count ?? 0}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{log.source_count ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalCount && totalCount > logs.length && (
            <p className="text-[11px] text-muted mt-3">
              최근 {logs.length}건 표시 / 전체 {totalCount}건
            </p>
          )}
        </div>
      </section>

      <Footer />
    </Layout>
  );
}

function Stat({ label, value, suffix, highlight, warn }: { label: string; value: number; suffix?: string; highlight?: boolean; warn?: boolean }) {
  const valueColor = warn && value > 0 ? 'text-red-600' : highlight ? 'text-cyan' : 'text-navy';
  return (
    <div className="border border-border bg-white px-4 py-3">
      <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-1">{label}</p>
      <p className={`text-[22px] font-bold tabular-nums ${valueColor}`}>
        {value.toLocaleString()} <span className="text-[12px] text-muted">{suffix}</span>
      </p>
    </div>
  );
}

function FilterTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 text-[12px] font-bold tracking-wider uppercase no-underline ${
        active ? 'bg-navy text-white' : 'bg-white border border-border text-muted hover:text-navy'
      }`}
    >
      {children}
    </Link>
  );
}
