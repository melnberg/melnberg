// 포춘쿠키 상세 페이지 — 운세 본문 + 댓글.
// 피드의 fortune_cookie 카드를 클릭하면 여기로 옴.

import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import FortuneCommentSection from '@/components/FortuneCommentSection';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type FortuneRow = {
  id: number;
  user_id: string;
  fortune_text: string;
  drawn_date: string;
  created_at: string;
};

type CommentRow = {
  id: number;
  author_id: string;
  content: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  link_url: string | null;
  tier: string | null;
  tier_expires_at: string | null;
  is_solo: boolean | null;
  avatar_url: string | null;
  apt_count: number | null;
};

function relTime(iso: string): string {
  const d = new Date(iso); const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default async function FortuneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fortuneId = Number(id);
  if (!Number.isFinite(fortuneId) || fortuneId <= 0) notFound();

  const supabase = await createClient();
  const me = await getCurrentUser();

  const { data: fortuneRaw } = await supabase
    .from('fortune_cookies')
    .select('id, user_id, fortune_text, drawn_date, created_at')
    .eq('id', fortuneId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!fortuneRaw) notFound();
  const fortune = fortuneRaw as FortuneRow;

  const { data: commentsRaw } = await supabase
    .from('fortune_comments')
    .select('id, author_id, content, created_at')
    .eq('fortune_id', fortuneId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  const comments = (commentsRaw ?? []) as CommentRow[];

  const profileIds = Array.from(new Set([fortune.user_id, ...comments.map((c) => c.author_id)]));
  const { data: profilesRaw } = await supabase
    .from('profiles')
    .select('id, display_name, link_url, tier, tier_expires_at, is_solo, avatar_url, apt_count')
    .in('id', profileIds);
  const profileMap = new Map<string, ProfileRow>();
  for (const p of (profilesRaw ?? []) as ProfileRow[]) profileMap.set(p.id, p);

  const author = profileMap.get(fortune.user_id) ?? null;
  const authorInfo = profileToNicknameInfo(author, fortune.user_id);
  const drawnLabel = (() => {
    const d = new Date(fortune.drawn_date);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  })();

  return (
    <Layout current="home">
      <MainTop crumbs={[{ label: '홈', href: '/' }, { label: '🥠 포춘쿠키' }]} />
      <div className="bg-white border-b border-border">
        <div className="px-4 sm:px-6 py-6 max-w-[760px] mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-bold tracking-widest uppercase bg-emerald-500 text-white px-2 py-0.5">포춘쿠키</span>
            <span className="text-[12px] text-emerald-700 font-bold">{drawnLabel}</span>
            <span className="ml-auto text-[11px] text-muted">{relTime(fortune.created_at)}</span>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[20px]">🥠</span>
            <Nickname info={authorInfo} />
            <span className="text-[12px] text-muted">의 운세</span>
          </div>
          <div className="text-[16px] leading-relaxed text-text whitespace-pre-wrap break-words bg-emerald-50 border-l-4 border-emerald-400 px-4 py-3">
            {fortune.fortune_text}
          </div>
        </div>
      </div>

      <FortuneCommentSection
        fortuneId={fortune.id}
        meId={me?.id ?? null}
        initialComments={comments.map((c) => ({
          id: c.id,
          author_id: c.author_id,
          content: c.content,
          created_at: c.created_at,
          author: profileToNicknameInfo(profileMap.get(c.author_id) ?? null, c.author_id),
        }))}
      />
    </Layout>
  );
}
