import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata = {
  title: '진행 중 베팅 — 멜른버그',
  description: '6시간 이내 시작된 베팅 폴 모음',
};

export const dynamic = 'force-dynamic';

type PollRow = {
  post_id: number;
  question: string | null;
  total_pool: number | string | null;
  created_at: string;
  mode?: string | null;
};

type PostRow = {
  id: number;
  author_id: string;
  title: string | null;
  category: string | null;
};

type ProfRow = {
  id: string;
  display_name: string | null;
};

type OptRow = {
  post_id: number;
  idx: number;
  label: string | null;
};

function categoryToBase(cat: string | null | undefined): string {
  if (cat === 'hotdeal') return '/hotdeal';
  if (cat === 'stocks') return '/stocks';
  if (cat === 'realty') return '/realty';
  if (cat === 'worry') return '/worry';
  return '/community';
}

function categoryLabel(cat: string | null | undefined): string {
  if (cat === 'hotdeal') return '🔥 핫딜';
  if (cat === 'stocks') return '📈 주식';
  if (cat === 'realty') return '🏢 부동산';
  if (cat === 'worry') return '💬 익명고민';
  return '커뮤니티';
}

function fmtRemaining(createdAt: string): string {
  // 베팅 폴 자체엔 종료시각이 없음 — 6시간 노출 윈도우의 남은 시간 표시
  const start = new Date(createdAt).getTime();
  const end = start + 6 * 3600 * 1000;
  const now = Date.now();
  const diff = Math.max(0, end - now);
  if (diff === 0) return '노출 종료';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}시간 ${m}분 남음`;
  return `${m}분 남음`;
}

export default async function ActiveBetsPage() {
  const supabase = createPublicClient();
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: pollsData } = await supabase
    .from('post_polls')
    .select('post_id, question, total_pool, created_at, mode')
    .eq('status', 'open')
    .gte('created_at', sixHoursAgo)
    .order('created_at', { ascending: false })
    .limit(50);
  const polls = (pollsData ?? []) as PollRow[];
  const postIds = polls.map((p) => p.post_id);

  let posts: PostRow[] = [];
  let opts: OptRow[] = [];
  let profs: ProfRow[] = [];
  if (postIds.length > 0) {
    const [postsResp, optsResp] = await Promise.all([
      supabase.from('posts').select('id, author_id, title, category').in('id', postIds)
        .then((r) => r, () => ({ data: null })),
      supabase.from('post_poll_options').select('post_id, idx, label').in('post_id', postIds).order('idx', { ascending: true })
        .then((r) => r, () => ({ data: null })),
    ]);
    posts = ((postsResp as { data: unknown[] | null }).data ?? []) as PostRow[];
    opts = ((optsResp as { data: unknown[] | null }).data ?? []) as OptRow[];
    const authorIds = Array.from(new Set(posts.map((p) => p.author_id)));
    if (authorIds.length > 0) {
      const { data: profData } = await supabase
        .from('profiles').select('id, display_name').in('id', authorIds)
        .then((r) => r, () => ({ data: null }));
      profs = ((profData ?? []) as ProfRow[]);
    }
  }
  const postMap = new Map<number, PostRow>();
  for (const p of posts) postMap.set(p.id, p);
  const profMap = new Map<string, string | null>();
  for (const p of profs) profMap.set(p.id, p.display_name);
  const optsByPost = new Map<number, string[]>();
  for (const o of opts) {
    const arr = optsByPost.get(o.post_id) ?? [];
    arr.push(o.label ?? '');
    optsByPost.set(o.post_id, arr);
  }

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '진행 중 베팅', bold: true }]} meta="Active Bets" />

      <section className="pt-8 lg:pt-14 pb-4">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          <h1 className="text-[24px] lg:text-[32px] font-bold text-navy tracking-tight">🎰 진행 중 베팅</h1>
          <p className="text-[12px] text-muted mt-1.5">최근 6시간 안에 시작된 폴만 노출됨.</p>
        </div>
      </section>

      <section className="pb-12">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          {polls.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted text-[15px] mb-3">지금 진행 중인 베팅이 없어요.</p>
              <p className="text-muted text-[12px] mb-6">글 작성 시 베팅/투표 옵션을 추가해 보세요.</p>
              <Link href="/community/new" className="inline-block bg-navy text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-navy-dark">
                글쓰기 →
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {polls.map((poll) => {
                const post = postMap.get(poll.post_id);
                if (!post) return null;
                const base = categoryToBase(post.category);
                const author = profMap.get(post.author_id) ?? '익명';
                const total = Number(poll.total_pool ?? 0);
                const optList = optsByPost.get(poll.post_id) ?? [];
                const isVote = poll.mode === 'vote';
                return (
                  <li key={poll.post_id} className="border border-border bg-white hover:border-navy hover:shadow-sm transition-all">
                    <Link href={`${base}/${poll.post_id}`} className="block px-4 py-3.5 no-underline">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 ${isVote ? 'bg-cyan/15 text-cyan' : 'bg-gradient-to-r from-yellow-400 to-pink-500 text-white'}`}>
                          {isVote ? '🗳 투표' : '🎰 베팅'}
                        </span>
                        <span className="text-[11px] text-muted">{categoryLabel(post.category)}</span>
                        <span className="text-[11px] text-muted ml-auto tabular-nums">{fmtRemaining(poll.created_at)}</span>
                      </div>
                      <div className="text-[15px] font-bold text-navy break-keep mb-1.5">
                        {post.title ?? '(제목 없음)'}
                      </div>
                      {poll.question && (
                        <div className="text-[13px] text-text break-keep mb-1.5">
                          {poll.question}
                        </div>
                      )}
                      {optList.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {optList.slice(0, 6).map((label, i) => (
                            <span key={i} className="text-[11px] px-2 py-0.5 bg-bg/50 text-text border border-border">
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-[11px] text-muted flex items-center gap-2 flex-wrap">
                        <span>by <b className="text-navy">{author}</b></span>
                        {!isVote && (
                          <>
                            <span>·</span>
                            <span>풀 <b className="text-navy tabular-nums">{total.toLocaleString()}</b> mlbg</span>
                          </>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </Layout>
  );
}
