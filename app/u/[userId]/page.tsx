import { notFound } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Nickname from '@/components/Nickname';
import BioComments from '@/components/BioComments';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { isActivePaid } from '@/lib/tier-utils';

export const dynamic = 'force-dynamic';

type Tab = 'posts' | 'comments' | 'occupier' | 'bio';

type ProfileRow = {
  id: string;
  display_name: string | null;
  naver_id: string | null;
  link_url: string | null;
  bio: string | null;
  is_solo: boolean | null;
  avatar_url: string | null;
  tier: 'free' | 'paid';
  tier_expires_at: string | null;
  created_at: string;
};

type CommunityPostRow = { id: number; title: string; created_at: string; category: string };
type AptDiscussionRow = { id: number; title: string; created_at: string; apt_master_id: number; apt_master: { apt_nm: string | null; dong: string | null } | null };
type CommunityCommentRow = { id: number; post_id: number; content: string; created_at: string; post: { title: string | null; category: string | null } | null };
type AptCommentRow = { id: number; discussion_id: number; content: string; created_at: string; discussion: { title: string | null; apt_master_id: number | null; apt_master: { apt_nm: string | null } | null } | null };
type EvictEvent = {
  occurred_at: string;
  event: 'claim' | 'evict' | 'vacate';
  apt_id: number;
  actor_id: string | null;
  prev_occupier_id: string | null;
  actor_name: string | null;
  prev_occupier_name: string | null;
  actor_score: number | null;
  prev_score: number | null;
  apt_master: { apt_nm: string | null } | null;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab = (['bio', 'posts', 'comments', 'occupier'] as Tab[]).includes(tabParam as Tab) ? (tabParam as Tab) : 'bio';

  const supabase = await createClient();
  const [{ data: profileData }, me] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, naver_id, link_url, bio, is_solo, avatar_url, tier, tier_expires_at, created_at')
      .eq('id', userId)
      .maybeSingle(),
    getCurrentUser(),
  ]);
  const profile = profileData as ProfileRow | null;
  if (!profile) notFound();

  const isPaid = isActivePaid({ tier: profile.tier, tier_expires_at: profile.tier_expires_at });
  const isOwner = me?.id === profile.id;

  // 카운트 — 탭 카운터 표시용
  const [
    { count: postCount },
    { count: aptCount },
    { count: commentCount },
    { count: aptCommentCount },
    { count: eventCount },
  ] = await Promise.all([
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId).eq('category', 'community'),
    supabase.from('apt_discussions').select('id', { count: 'exact', head: true }).eq('author_id', userId).is('deleted_at', null),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('author_id', userId),
    supabase.from('apt_discussion_comments').select('id', { count: 'exact', head: true }).eq('author_id', userId).is('deleted_at', null),
    supabase.from('apt_occupier_events').select('occurred_at', { count: 'exact', head: true }).or(`actor_id.eq.${userId},prev_occupier_id.eq.${userId}`),
  ]);

  const totalPosts = (postCount ?? 0) + (aptCount ?? 0);
  const totalComments = (commentCount ?? 0) + (aptCommentCount ?? 0);

  // 탭별 데이터 fetch
  let postsRows: Array<CommunityPostRow & { kind: 'community' }> = [];
  let aptDiscRows: Array<AptDiscussionRow & { kind: 'apt' }> = [];
  let commentRows: Array<CommunityCommentRow & { kind: 'community' }> = [];
  let aptCmtRows: Array<AptCommentRow & { kind: 'apt' }> = [];
  let eventRows: EvictEvent[] = [];

  if (tab === 'posts') {
    const [{ data: cp }, { data: ap }] = await Promise.all([
      supabase.from('posts').select('id, title, created_at, category').eq('author_id', userId).eq('category', 'community').order('created_at', { ascending: false }).limit(50),
      supabase.from('apt_discussions').select('id, title, created_at, apt_master_id, apt_master(apt_nm, dong)').eq('author_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
    ]);
    postsRows = ((cp ?? []) as CommunityPostRow[]).map((r) => ({ ...r, kind: 'community' as const }));
    aptDiscRows = ((ap ?? []) as unknown as AptDiscussionRow[]).map((r) => ({ ...r, kind: 'apt' as const }));
  } else if (tab === 'comments') {
    const [{ data: cc }, { data: ac }] = await Promise.all([
      supabase.from('comments').select('id, post_id, content, created_at, post:posts!post_id(title, category)').eq('author_id', userId).order('created_at', { ascending: false }).limit(50),
      supabase.from('apt_discussion_comments').select('id, discussion_id, content, created_at, discussion:apt_discussions!discussion_id(title, apt_master_id, apt_master(apt_nm))').eq('author_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
    ]);
    commentRows = ((cc ?? []) as unknown as CommunityCommentRow[])
      .filter((r) => r.post?.category === 'community')
      .map((r) => ({ ...r, kind: 'community' as const }));
    aptCmtRows = ((ac ?? []) as unknown as AptCommentRow[]).map((r) => ({ ...r, kind: 'apt' as const }));
  } else if (tab === 'occupier') {
    const { data } = await supabase
      .from('apt_occupier_events')
      .select('occurred_at, event, apt_id, actor_id, prev_occupier_id, actor_name, prev_occupier_name, actor_score, prev_score, apt_master(apt_nm)')
      .or(`actor_id.eq.${userId},prev_occupier_id.eq.${userId}`)
      .order('occurred_at', { ascending: false })
      .limit(100);
    eventRows = (data ?? []) as unknown as EvictEvent[];
  }

  // 탭 합치기 (글/댓글)
  type PostListRow = { id: number; title: string; created_at: string; href: string; tag: string };
  const allPosts: PostListRow[] = [
    ...postsRows.map((r) => ({ id: r.id, title: r.title, created_at: r.created_at, href: `/community/${r.id}`, tag: '커뮤니티' })),
    ...aptDiscRows.map((r) => ({
      id: r.id,
      title: r.title,
      created_at: r.created_at,
      href: `/?apt=${r.apt_master_id}`,
      tag: r.apt_master?.apt_nm ?? '아파트',
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  type CommentListRow = { id: number; content: string; parentTitle: string; created_at: string; href: string; tag: string };
  const allComments: CommentListRow[] = [
    ...commentRows.map((r) => ({
      id: r.id,
      content: r.content,
      parentTitle: r.post?.title ?? '(삭제된 글)',
      created_at: r.created_at,
      href: `/community/${r.post_id}`,
      tag: '커뮤니티',
    })),
    ...aptCmtRows.map((r) => ({
      id: r.id,
      content: r.content,
      parentTitle: r.discussion?.title ?? '(삭제된 글)',
      created_at: r.created_at,
      href: `/?apt=${r.discussion?.apt_master_id ?? 0}`,
      tag: r.discussion?.apt_master?.apt_nm ?? '아파트',
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: `/u/${userId}`, label: profile.display_name ?? '회원', bold: true },
      ]} meta="Profile" />

      <section className="py-10">
        <div className="max-w-[680px] mx-auto px-6">
          {/* 헤더 — 아바타·닉네임·SNS·등급 */}
          <div className="border border-border bg-white p-5 mb-6 flex items-center gap-4">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border border-border flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-navy-soft border border-border flex items-center justify-center text-navy text-[22px] font-bold flex-shrink-0">
                {(profile.display_name?.[0] ?? '').toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-[24px] font-bold text-navy tracking-tight mb-1">
                <Nickname info={{ name: profile.display_name, link: profile.link_url, isPaid, isSolo: !!profile.is_solo, userId: profile.id, avatarUrl: null }} />
              </h1>
              <div className="text-[12px] text-muted">
                가입일 {new Date(profile.created_at).toLocaleDateString('ko-KR')}
                {isPaid && profile.tier_expires_at && (
                  <> · 만료일 {new Date(profile.tier_expires_at).toLocaleDateString('ko-KR')}</>
                )}
              </div>
            </div>
          </div>

          {/* 탭 — 자기소개 기본 */}
          <div className="flex border-b border-border mb-4">
            <TabLink href={`/u/${userId}?tab=bio`} active={tab === 'bio'}>자기소개</TabLink>
            <TabLink href={`/u/${userId}?tab=posts`} active={tab === 'posts'}>글 ({totalPosts})</TabLink>
            <TabLink href={`/u/${userId}?tab=comments`} active={tab === 'comments'}>댓글 ({totalComments})</TabLink>
            <TabLink href={`/u/${userId}?tab=occupier`} active={tab === 'occupier'}>점거·퇴거 ({eventCount ?? 0})</TabLink>
          </div>

          {/* 탭 콘텐츠 */}
          {tab === 'posts' && (
            <ul className="space-y-2">
              {allPosts.length === 0 ? (
                <li className="text-center py-12 text-muted text-[13px]">작성한 글이 없습니다.</li>
              ) : allPosts.map((p, i) => (
                <li key={`${p.tag}-${p.id}-${i}`} className="border border-border px-4 py-3 hover:border-navy bg-white">
                  <Link href={p.href} className="no-underline">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold tracking-wider uppercase bg-cyan/15 text-cyan px-1.5 py-0.5">{p.tag}</span>
                      <span className="text-[10px] text-muted ml-auto">{fmtDate(p.created_at)}</span>
                    </div>
                    <div className="text-[14px] font-bold text-navy break-words">{p.title}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {tab === 'comments' && (
            <ul className="space-y-2">
              {allComments.length === 0 ? (
                <li className="text-center py-12 text-muted text-[13px]">작성한 댓글이 없습니다.</li>
              ) : allComments.map((c, i) => (
                <li key={`${c.tag}-${c.id}-${i}`} className="border border-border px-4 py-3 hover:border-navy bg-white">
                  <Link href={c.href} className="no-underline">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold tracking-wider uppercase bg-cyan/15 text-cyan px-1.5 py-0.5">{c.tag}</span>
                      <span className="text-[10px] text-muted ml-auto">{fmtDate(c.created_at)}</span>
                    </div>
                    <div className="text-[12px] text-muted truncate mb-1">↳ {c.parentTitle}</div>
                    <div className="text-[13px] text-text break-words whitespace-pre-wrap leading-snug">{c.content}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {tab === 'occupier' && (
            eventRows.length === 0 ? (
              <p className="text-center py-12 text-muted text-[13px]">점거·퇴거 이력이 없습니다.</p>
            ) : (
              <ol className="border-t border-border">
                {eventRows.map((e, i) => {
                  const aptName = e.apt_master?.apt_nm ?? '(단지)';
                  const isUserActor = e.actor_id === profile.id;
                  return (
                    <li key={`${e.apt_id}-${e.occurred_at}-${i}`} className="flex gap-3 text-[13px] leading-snug border-b border-border py-2.5 px-1">
                      <span className="text-[11px] text-muted tabular-nums flex-shrink-0 w-[110px] mt-0.5">{fmtDate(e.occurred_at)}</span>
                      <Link href={`/?apt=${e.apt_id}`} className="flex-1 min-w-0 text-text no-underline hover:underline break-words">
                        <span className="text-navy font-bold">{aptName}</span>
                        {' '}
                        {e.event === 'claim' && <span>점거</span>}
                        {e.event === 'vacate' && (
                          <span>
                            <span className="text-muted">자진퇴거</span>
                            <span className="text-muted text-[10px] ml-1">(다른 단지 점거로 자동)</span>
                          </span>
                        )}
                        {e.event === 'evict' && (
                          <>
                            {isUserActor ? (
                              <span>
                                <span className="text-red-500 font-bold">강제집행</span>
                                <span className="text-muted">{' — '}</span>
                                <span className="text-muted line-through">{e.prev_occupier_name ?? '익명'}</span>
                                <span className="text-muted text-[10px] ml-1">축출 (score {e.prev_score ?? '?'} → {e.actor_score ?? '?'})</span>
                              </span>
                            ) : (
                              <span>
                                <span className="text-red-500 font-bold">강제집행 당함</span>
                                <span className="text-muted">{' — '}</span>
                                <span className="text-text">{e.actor_name ?? '익명'}</span>
                                <span className="text-muted text-[10px] ml-1">에게 (score {e.prev_score ?? '?'} → {e.actor_score ?? '?'})</span>
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )
          )}

          {tab === 'bio' && (
            <div>
              <div className="border border-border bg-white p-5 min-h-[200px]">
                {profile.bio ? (
                  <p className="text-[14px] text-text whitespace-pre-wrap leading-relaxed break-words">{profile.bio}</p>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <p className="text-[13px] text-muted">자기소개가 비어있습니다.</p>
                    {isOwner && (
                      <Link
                        href="/me#bio"
                        className="bg-navy text-white px-4 py-2 text-[12px] font-bold no-underline hover:bg-navy-dark"
                      >
                        내 자기소개 쓰러가기 →
                      </Link>
                    )}
                  </div>
                )}
              </div>
              <BioComments profileUserId={profile.id} />
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2.5 text-[13px] font-bold no-underline border-b-2 -mb-px ${
        active ? 'border-navy text-navy' : 'border-transparent text-muted hover:text-navy'
      }`}
    >
      {children}
    </Link>
  );
}
