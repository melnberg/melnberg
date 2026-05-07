import { notFound } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Nickname from '@/components/Nickname';
import BioComments from '@/components/BioComments';
import ThreadList, { type Thread } from '@/components/ThreadList';
import ThreadComposer from '@/components/ThreadComposer';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { isActivePaid } from '@/lib/tier-utils';

export const dynamic = 'force-dynamic';

type Tab = 'posts' | 'comments' | 'occupier' | 'bio' | 'apts' | 'assets';

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
  const tab: Tab = (['bio', 'posts', 'comments', 'occupier', 'apts', 'assets'] as Tab[]).includes(tabParam as Tab) ? (tabParam as Tab) : 'bio';

  const supabase = await createClient();
  // base — schema.sql 부터 항상 존재
  const [{ data: baseData }, me] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, tier, tier_expires_at, created_at')
      .eq('id', userId)
      .maybeSingle(),
    getCurrentUser(),
  ]);
  if (!baseData) notFound();

  // 확장 컬럼 — 마이그레이션 미적용이어도 깨지지 않게 best-effort
  const { data: extData } = await supabase
    .from('profiles')
    .select('naver_id, link_url, bio, is_solo, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  const ext = (extData ?? {}) as { naver_id?: string | null; link_url?: string | null; bio?: string | null; is_solo?: boolean | null; avatar_url?: string | null };
  // 보유 단지 수 — SQL 062 미적용 시 graceful
  const { data: housingCountData } = await supabase
    .from('profiles').select('apt_count').eq('id', userId).maybeSingle()
    .then((r) => r, () => ({ data: null }));
  const housingCount = (housingCountData as { apt_count?: number | null } | null)?.apt_count ?? null;
  const profile: ProfileRow = {
    ...(baseData as { id: string; display_name: string | null; tier: 'free' | 'paid'; tier_expires_at: string | null; created_at: string }),
    naver_id: ext.naver_id ?? null,
    link_url: ext.link_url ?? null,
    bio: ext.bio ?? null,
    is_solo: ext.is_solo ?? null,
    avatar_url: ext.avatar_url ?? null,
  };

  const isPaid = isActivePaid({ tier: profile.tier, tier_expires_at: profile.tier_expires_at });
  const isOwner = me?.id === profile.id;

  // 카운트 — 탭 카운터 표시용
  const [
    { count: postCount },
    { count: aptCount },
    { count: commentCount },
    { count: aptCommentCount },
    { count: eventCount },
    { count: ownedAptCount },
  ] = await Promise.all([
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId).in('category', ['community', 'hotdeal']),
    supabase.from('apt_discussions').select('id', { count: 'exact', head: true }).eq('author_id', userId).is('deleted_at', null),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('author_id', userId),
    supabase.from('apt_discussion_comments').select('id', { count: 'exact', head: true }).eq('author_id', userId).is('deleted_at', null),
    supabase.from('apt_occupier_events').select('occurred_at', { count: 'exact', head: true }).or(`actor_id.eq.${userId},prev_occupier_id.eq.${userId}`),
    supabase.from('apt_master').select('id', { count: 'exact', head: true }).eq('occupier_id', userId),
  ]);

  const totalPosts = (postCount ?? 0) + (aptCount ?? 0);
  const totalComments = (commentCount ?? 0) + (aptCommentCount ?? 0);

  // 탭별 데이터 fetch
  let postsRows: Array<CommunityPostRow & { kind: 'community' }> = [];
  let aptDiscRows: Array<AptDiscussionRow & { kind: 'apt' }> = [];
  let commentRows: Array<CommunityCommentRow & { kind: 'community' }> = [];
  let aptCmtRows: Array<AptCommentRow & { kind: 'apt' }> = [];
  let eventRows: EvictEvent[] = [];
  let ownedApts: Array<{ id: number; apt_nm: string; dong: string | null; listing_price: number | string | null; occupied_at: string | null }> = [];
  let assetsData: {
    cash: number;
    emarts: Array<{ id: number; name: string; cost: number }>;
    factories: Array<{ id: number; name: string; brand: string; cost: number }>;
    apts: Array<{ id: number; apt_nm: string; dong: string | null; value: number; source: '분양가' | '실거래' }>;
  } | null = null;

  if (tab === 'posts') {
    const [{ data: cp }, { data: ap }] = await Promise.all([
      supabase.from('posts').select('id, title, created_at, category').eq('author_id', userId).in('category', ['community', 'hotdeal']).order('created_at', { ascending: false }).limit(50),
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
      .filter((r) => r.post?.category === 'community' || r.post?.category === 'hotdeal')
      .map((r) => ({ ...r, kind: 'community' as const }));
    aptCmtRows = ((ac ?? []) as unknown as AptCommentRow[]).map((r) => ({ ...r, kind: 'apt' as const }));
  } else if (tab === 'apts') {
    const { data } = await supabase
      .from('apt_master_with_listing')
      .select('id, apt_nm, dong, listing_price, occupied_at')
      .eq('occupier_id', userId)
      .order('occupied_at', { ascending: false })
      .limit(200);
    ownedApts = (data ?? []) as typeof ownedApts;
  } else if (tab === 'assets') {
    const [{ data: bal }, { data: emartRows }, { data: factoryRows }, { data: aptRows }] = await Promise.all([
      supabase.from('profiles').select('mlbg_balance').eq('id', userId).maybeSingle(),
      supabase.from('emart_occupations').select('emart_id, emart:emart_locations!emart_id(id, name)').eq('user_id', userId),
      supabase.from('factory_occupations').select('factory_id, factory:factory_locations!factory_id(id, name, brand, occupy_price)').eq('user_id', userId),
      supabase.rpc('get_user_apt_assets', { p_uid: userId }),
    ]);
    const cash = Number((bal as { mlbg_balance?: number | string | null } | null)?.mlbg_balance ?? 0);
    const emarts = ((emartRows ?? []) as Array<{ emart: { id?: number; name?: string } | { id?: number; name?: string }[] | null }>).map((r) => {
      const e = Array.isArray(r.emart) ? r.emart[0] : r.emart;
      return { id: Number(e?.id ?? 0), name: e?.name ?? '이마트', cost: 5 };
    }).filter((x) => x.id > 0);
    const factories = ((factoryRows ?? []) as Array<{ factory: { id?: number; name?: string; brand?: string; occupy_price?: number | string } | { id?: number; name?: string; brand?: string; occupy_price?: number | string }[] | null }>).map((r) => {
      const f = Array.isArray(r.factory) ? r.factory[0] : r.factory;
      return { id: Number(f?.id ?? 0), name: f?.name ?? '시설', brand: f?.brand ?? '', cost: Number(f?.occupy_price ?? 0) };
    }).filter((x) => x.id > 0);
    const apts = ((aptRows ?? []) as Array<{ id: number; apt_nm: string; dong: string | null; value: number | string; source: '분양가' | '실거래' }>).map((r) => ({
      id: Number(r.id), apt_nm: r.apt_nm, dong: r.dong,
      value: Number(r.value),
      source: r.source,
    }));
    assetsData = { cash, emarts, factories, apts };
  } else if (tab === 'occupier') {
    const { data } = await supabase
      .from('apt_occupier_events')
      .select('occurred_at, event, apt_id, actor_id, prev_occupier_id, actor_name, prev_occupier_name, actor_score, prev_score, apt_master(apt_nm)')
      .or(`actor_id.eq.${userId},prev_occupier_id.eq.${userId}`)
      .order('occurred_at', { ascending: false })
      .limit(100);
    eventRows = (data ?? []) as unknown as EvictEvent[];
  }

  // 스레드 — 항상 fetch (탭 무관, 페이지 하단 섹션). 본인이면 작성 폼 노출.
  type RawAuthor = { display_name: string | null; avatar_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo: boolean | null; link_url: string | null };
  type RawThread = {
    id: number;
    author_id: string;
    parent_id: number | null;
    content: string;
    like_count: number;
    reply_count: number;
    created_at: string;
    author: RawAuthor | RawAuthor[] | null;
  };
  const { data: threadsRaw } = await supabase
    .from('threads')
    .select('id, author_id, parent_id, content, like_count, reply_count, created_at, author:profiles!author_id(display_name, avatar_url, tier, tier_expires_at, is_solo, link_url)')
    .eq('author_id', userId)
    .is('parent_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  const threadRows = (threadsRaw ?? []) as unknown as RawThread[];
  let userThreads: Thread[] = [];
  if (threadRows.length > 0) {
    let likedSet = new Set<number>();
    if (me?.id) {
      const { data: likes } = await supabase
        .from('thread_likes')
        .select('thread_id')
        .eq('user_id', me.id)
        .in('thread_id', threadRows.map((t) => t.id));
      likedSet = new Set((likes ?? []).map((l) => (l as { thread_id: number }).thread_id));
    }
    userThreads = threadRows.map((t) => ({
      id: t.id,
      author_id: t.author_id,
      parent_id: t.parent_id,
      content: t.content,
      like_count: t.like_count,
      reply_count: t.reply_count,
      created_at: t.created_at,
      author: Array.isArray(t.author) ? (t.author[0] ?? null) : t.author,
      liked: likedSet.has(t.id),
    }));
  }

  // 탭 합치기 (글/댓글)
  type PostListRow = { id: number; title: string; created_at: string; href: string; tag: string };
  const allPosts: PostListRow[] = [
    ...postsRows.map((r) => ({
      id: r.id, title: r.title, created_at: r.created_at,
      href: r.category === 'hotdeal' ? `/hotdeal/${r.id}` : `/community/${r.id}`,
      tag: r.category === 'hotdeal' ? '핫딜' : '커뮤니티',
    })),
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
    ...commentRows.map((r) => {
      const isHotdeal = r.post?.category === 'hotdeal';
      return {
        id: r.id,
        content: r.content,
        parentTitle: r.post?.title ?? '(삭제된 글)',
        created_at: r.created_at,
        href: isHotdeal ? `/hotdeal/${r.post_id}` : `/community/${r.post_id}`,
        tag: isHotdeal ? '핫딜' : '커뮤니티',
      };
    }),
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
                <Nickname info={profileToNicknameInfo({ ...profile, apt_count: housingCount }, profile.id)} />
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
            <TabLink href={`/u/${userId}?tab=apts`} active={tab === 'apts'}>보유 단지 ({ownedAptCount ?? 0})</TabLink>
            <TabLink href={`/u/${userId}?tab=assets`} active={tab === 'assets'}>자산</TabLink>
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

          {tab === 'apts' && (
            ownedApts.length === 0 ? (
              <p className="text-center py-12 text-muted text-[13px]">보유한 단지가 없습니다.</p>
            ) : (
              <ul className="border border-border">
                {ownedApts.map((a) => {
                  const lp = a.listing_price == null ? null : Number(a.listing_price);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-b-0 bg-white">
                      <Link href={`/?apt=${a.id}`} className="flex-1 min-w-0 no-underline">
                        <div className="text-[13px] font-bold text-navy truncate">{a.apt_nm}</div>
                        <div className="text-[11px] text-muted mt-0.5">
                          {a.dong ?? ''}
                          {a.occupied_at && ` · 분양 ${new Date(a.occupied_at).toLocaleDateString('ko-KR')}`}
                        </div>
                      </Link>
                      <div className="text-right flex-shrink-0">
                        {lp != null ? (
                          <>
                            <div className="text-[12px] font-bold text-cyan tabular-nums">{lp.toLocaleString()} mlbg</div>
                            <div className="text-[10px] font-bold tracking-widest uppercase text-cyan mt-0.5">매물</div>
                          </>
                        ) : (
                          <div className="text-[10px] font-bold tracking-widest uppercase text-muted">보유중</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}

          {tab === 'assets' && assetsData && (() => {
            const aptValueSum = assetsData.apts.reduce((s, a) => s + a.value, 0);
            const commercialSum = assetsData.emarts.reduce((s, e) => s + e.cost, 0)
                                + assetsData.factories.reduce((s, f) => s + f.cost, 0);
            const total = assetsData.cash + commercialSum + aptValueSum;
            return (
              <div className="border border-border bg-white">
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="bg-navy-soft text-[11px] tracking-wider uppercase text-navy">
                      <th className="text-left px-4 py-2 font-bold w-[100px]">분류</th>
                      <th className="text-left px-4 py-2 font-bold">항목</th>
                      <th className="text-right px-4 py-2 font-bold w-[140px]">평가액 (mlbg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AssetRow cat="현금성" name="현금 잔액" value={assetsData.cash} />
                    {assetsData.emarts.length === 0 && assetsData.factories.length === 0 ? (
                      <AssetRow cat="상업용" name="(보유 없음)" value={null} />
                    ) : (
                      <>
                        {assetsData.emarts.map((e) => (
                          <AssetRow key={`em-${e.id}`} cat="상업용" name={`이마트 ${e.name}`} value={e.cost} />
                        ))}
                        {assetsData.factories.map((f) => (
                          <AssetRow key={`fc-${f.id}`} cat="상업용" name={f.name} value={f.cost} />
                        ))}
                      </>
                    )}
                    {assetsData.apts.length === 0 ? (
                      <AssetRow cat="주거용" name="(보유 없음)" value={null} />
                    ) : (
                      assetsData.apts.map((a) => (
                        <AssetRow key={`ap-${a.id}`} cat="주거용"
                          name={`${a.apt_nm}${a.dong ? ` (${a.dong})` : ''}`}
                          value={a.value}
                          source={a.source}
                        />
                      ))
                    )}
                    <tr className="border-t-2 border-navy bg-navy-soft">
                      <td className="px-4 py-3 font-bold text-navy">합계</td>
                      <td className="px-4 py-3 text-muted text-[11px]">
                        주거용 = 실거래가 ▸ 없으면 구별 분양가
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-cyan text-[15px]">
                        {total.toLocaleString()} mlbg
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

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

          {/* 스레드 — 탭 무관 항상 노출. 본인이면 작성 폼. */}
          <div className="mt-10">
            <h2 className="text-[14px] font-bold tracking-widest uppercase text-navy mb-3">스레드</h2>
            {isOwner && <ThreadComposer />}
            <ThreadList
              threads={userThreads}
              currentUserId={me?.id ?? null}
              showAuthor={false}
              emptyText={isOwner ? '아직 글이 없어요. 첫 글을 남겨보세요.' : '아직 글이 없어요.'}
            />
          </div>
        </div>
      </section>
    </Layout>
  );
}

function AssetRow({ cat, name, value, source }: { cat: string; name: string; value: number | null; source?: '분양가' | '실거래' }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-2.5 text-[12px] text-muted whitespace-nowrap">{cat}</td>
      <td className="px-4 py-2.5 text-text break-words">{name}</td>
      <td className="px-4 py-2.5 text-right text-text">
        {value == null ? <span className="text-muted">—</span> : (
          <span className="inline-flex items-center gap-2 justify-end">
            {source && (
              <span className={`text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 ${
                source === '실거래' ? 'bg-cyan/15 text-cyan' : 'bg-navy/10 text-navy'
              }`}>{source}</span>
            )}
            <span>{value.toLocaleString()}</span>
          </span>
        )}
      </td>
    </tr>
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
