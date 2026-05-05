import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Nickname from '@/components/Nickname';
import RewardTooltip from '@/components/RewardTooltip';
import AptCommentSection from '@/components/AptCommentSection';
import { createClient } from '@/lib/supabase/server';
import { linkify } from '@/lib/linkify';
import { profileToNicknameInfo } from '@/lib/nickname-info';

export const dynamic = 'force-dynamic';

function relTime(iso: string): string {
  const d = new Date(iso); const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일 전`;
  return d.toLocaleDateString('ko-KR');
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('apt_discussions')
    .select('title, content')
    .eq('id', Number(id))
    .maybeSingle();
  if (!data) return {};
  const title = (data as { title?: string }).title ?? '단지 토론';
  return {
    title: `${title} — 멜른버그`,
    description: ((data as { content?: string }).content ?? '').slice(0, 140),
  };
}

export default async function AptDiscussionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = await createClient();

  // 임베드 없이 단순 select — 임베드 실패 시 통째로 null 되는 것 방지
  const [{ data: post }, { data: { user } }] = await Promise.all([
    supabase
      .from('apt_discussions')
      .select('id, apt_master_id, author_id, title, content, created_at, updated_at, deleted_at')
      .eq('id', numId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!post) notFound();

  const aptMasterIdRaw = (post as { apt_master_id: number }).apt_master_id;
  const authorIdRaw = (post as { author_id: string }).author_id;
  const [{ data: am }, { data: author }] = await Promise.all([
    supabase.from('apt_master').select('apt_nm, dong, lat, lng').eq('id', aptMasterIdRaw).maybeSingle(),
    supabase.from('profiles').select('display_name, link_url, tier, tier_expires_at, is_solo, avatar_url').eq('id', authorIdRaw).maybeSingle(),
  ]);

  // 댓글도 임베드 없이 단순 fetch + 작성자 별도 조회
  const { data: rawComments } = await supabase
    .from('apt_discussion_comments')
    .select('id, discussion_id, author_id, content, created_at')
    .eq('discussion_id', numId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  const commentList = (rawComments ?? []) as Array<{ id: number; discussion_id: number; author_id: string; content: string; created_at: string }>;
  const authorIds = Array.from(new Set(commentList.map((c) => c.author_id)));
  let profMap = new Map<string, Record<string, unknown>>();
  if (authorIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name, link_url, tier, tier_expires_at, is_solo, avatar_url')
      .in('id', authorIds);
    for (const p of (profs ?? []) as Array<{ id: string }>) {
      profMap.set(p.id, p as unknown as Record<string, unknown>);
    }
  }
  const comments = commentList.map((c) => ({ ...c, author: profMap.get(c.author_id) ?? null }));

  // 적립 매핑 — 본글 + 댓글
  const commentIds = (comments ?? []).map((c) => (c as { id: number }).id);
  const { data: awardRows } = await supabase
    .from('mlbg_award_log')
    .select('kind, ref_id, earned')
    .in('ref_id', [numId, ...commentIds]);
  const earnedMap = new Map<string, number>();
  for (const r of (awardRows ?? []) as Array<{ kind: string; ref_id: number; earned: number }>) {
    earnedMap.set(`${r.kind}:${r.ref_id}`, Number(r.earned));
  }
  const postEarned = earnedMap.get(`apt_post:${numId}`) ?? 0;
  const commentEarnedMap: Record<number, number> = {};
  for (const cid of commentIds) {
    const v = earnedMap.get(`apt_comment:${cid}`);
    if (v && v > 0) commentEarnedMap[cid] = v;
  }

  const aptMasterId = (post as { apt_master_id: number }).apt_master_id;
  const aptName = am?.apt_nm ?? '단지';
  const dong = am?.dong ?? null;

  // 현재 사용자 프로필 (댓글 작성용)
  let currentUserName: string | null = null;
  if (user) {
    const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    currentUserName = (prof as { display_name?: string } | null)?.display_name
      ?? (user.user_metadata?.display_name as string | undefined)
      ?? user.email?.split('@')[0] ?? '회원';
  }

  if ((post as { deleted_at: string | null }).deleted_at) {
    return (
      <Layout>
        <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '삭제된 글', bold: true }]} meta="Deleted" />
        <article className="py-24">
          <div className="max-w-[520px] mx-auto px-6 text-center">
            <h1 className="text-[20px] font-bold text-navy mb-3">삭제된 글이에요</h1>
            <Link href="/" className="inline-block bg-navy text-white px-6 py-3 text-[13px] font-bold no-underline hover:bg-navy-dark">← 피드로</Link>
          </div>
        </article>
      </Layout>
    );
  }

  const postRow = post as {
    id: number; title: string; content: string; created_at: string; updated_at: string; author_id: string;
  };

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { label: aptName, bold: true },
      ]} meta="Discussion" />

      <article className="py-8">
        <div className="max-w-[680px] mx-auto px-4 lg:px-6">
          {/* 헤더 */}
          <header className="pb-4 mb-5 border-b border-border">
            <div className="text-[12px] font-bold text-navy mb-1.5 flex items-center gap-2 flex-wrap">
              <span>{aptName}</span>
              {dong && <span className="text-muted font-normal">· {dong}</span>}
              <Link href={`/?apt=${aptMasterId}`} className="ml-auto text-[11px] text-muted hover:text-navy no-underline inline-flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                지도에서 보기
              </Link>
            </div>
            <h1 className="text-[22px] lg:text-[24px] font-bold text-navy tracking-tight leading-tight mb-3 break-keep">{postRow.title}</h1>
            <div className="flex items-center gap-2 text-[12px] text-muted flex-wrap">
              <span className="font-bold text-navy">
                <Nickname info={profileToNicknameInfo(author as Parameters<typeof profileToNicknameInfo>[0], postRow.author_id)} />
              </span>
              <span>·</span>
              <span>{relTime(postRow.created_at)}</span>
              {postRow.updated_at !== postRow.created_at && (<><span>·</span><span>수정됨</span></>)}
              {postEarned > 0 && (<><span>·</span><RewardTooltip earned={postEarned} kind="apt_post" /></>)}
            </div>
          </header>

          {/* 본문 */}
          <div className="text-[15px] leading-loose break-keep whitespace-pre-wrap mb-10">
            {linkify(postRow.content)}
          </div>

          {/* 댓글 */}
          <AptCommentSection
            discussionId={numId}
            comments={(comments ?? []) as unknown as Parameters<typeof AptCommentSection>[0]['comments']}
            currentUserId={user?.id ?? null}
            currentUserName={currentUserName}
            earnedMap={commentEarnedMap}
          />

          <div className="mt-8 pt-5 border-t border-border flex justify-between items-center">
            <Link href="/" className="text-[13px] font-bold text-navy no-underline hover:underline">← 피드로</Link>
          </div>
        </div>
      </article>
    </Layout>
  );
}
