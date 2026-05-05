'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Nickname from './Nickname';

type Comment = {
  id: number;
  author_id: string;
  content: string;
  created_at: string;
  author?: { display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo: boolean | null; avatar_url: string | null; apt_count: number | null } | null;
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function BioComments({ profileUserId }: { profileUserId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; isPaid: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setMe(null); }
      else {
        const { data } = await supabase
          .from('profiles')
          .select('tier, tier_expires_at')
          .eq('id', user.id)
          .maybeSingle();
        const t = data as { tier?: string | null; tier_expires_at?: string | null } | null;
        const isPaid = t?.tier === 'paid' && (!t.tier_expires_at || new Date(t.tier_expires_at) > new Date());
        if (!cancelled) setMe({ id: user.id, isPaid });
      }
      const { data: rows } = await supabase
        .from('profile_bio_comments')
        .select('id, author_id, content, created_at')
        .eq('profile_user_id', profileUserId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100);
      const list = (rows ?? []) as Array<{ id: number; author_id: string; content: string; created_at: string }>;
      const ids = Array.from(new Set(list.map((r) => r.author_id)));
      let authorMap = new Map<string, Comment['author']>();
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, link_url, tier, tier_expires_at, is_solo, avatar_url')
          .in('id', ids);
        for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo: boolean | null; avatar_url: string | null; apt_count: number | null }>) {
          authorMap.set(p.id, p);
        }
      }
      if (!cancelled) {
        setComments(list.map((r) => ({ ...r, author: authorMap.get(r.author_id) ?? null })));
      }
    })();
    return () => { cancelled = true; };
  }, [profileUserId, supabase]);

  async function submit() {
    if (busy) return;
    const t = content.trim();
    if (!t) return;
    if (!me?.id) { setErr('로그인이 필요합니다.'); return; }
    if (!me.isPaid) { setErr('조합원만 댓글을 달 수 있습니다.'); return; }
    if (me.id === profileUserId) { setErr('본인 자기소개에는 댓글을 달 수 없습니다.'); return; }
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase
      .from('profile_bio_comments')
      .insert({ profile_user_id: profileUserId, author_id: me.id, content: t })
      .select('id, author_id, content, created_at')
      .maybeSingle();
    if (error) { setBusy(false); setErr(error.message); return; }
    if (data) {
      // 작성자 본인 프로필 가져오기
      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, link_url, tier, tier_expires_at, is_solo, avatar_url')
        .eq('id', me.id)
        .maybeSingle();
      setComments((prev) => [{ ...(data as { id: number; author_id: string; content: string; created_at: string }), author: prof as Comment['author'] }, ...(prev ?? [])]);
      setContent('');
    }
    setBusy(false);
  }

  async function remove(id: number) {
    if (!confirm('댓글을 삭제할까요?')) return;
    const { error } = await supabase.from('profile_bio_comments').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    router.refresh();
  }

  function isAuthorPaid(c: Comment): boolean {
    const t = c.author;
    return t?.tier === 'paid' && (!t.tier_expires_at || new Date(t.tier_expires_at) > new Date());
  }

  return (
    <div className="mt-6 border-t border-border pt-5">
      <h2 className="text-[14px] font-bold text-navy mb-3">댓글 ({comments?.length ?? 0})</h2>

      {/* 입력 */}
      {me?.id === profileUserId ? (
        <p className="text-[12px] text-muted mb-3">본인 자기소개에는 댓글을 달 수 없습니다.</p>
      ) : !me ? (
        <p className="text-[12px] text-muted mb-3">로그인 후 조합원이면 댓글을 달 수 있습니다.</p>
      ) : !me.isPaid ? (
        <p className="text-[12px] text-muted mb-3">조합원만 댓글을 달 수 있습니다.</p>
      ) : (
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={content}
            onChange={(e) => { setContent(e.target.value); setErr(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder="자기소개에 한마디 (예: 착한 사람이에요 ✨)"
            maxLength={500}
            className="flex-1 border border-border px-3 py-2 text-[13px] outline-none focus:border-navy"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !content.trim()}
            className="bg-navy text-white px-4 py-2 text-[12px] font-bold hover:bg-navy-dark disabled:opacity-40"
          >
            {busy ? '...' : '등록'}
          </button>
        </div>
      )}
      {err && <div className="text-[11px] text-red-700 mb-3">{err}</div>}

      {/* 목록 */}
      {comments === null ? (
        <p className="text-[12px] text-muted text-center py-6">불러오는 중...</p>
      ) : comments.length === 0 ? (
        <p className="text-[12px] text-muted text-center py-6">첫 댓글을 남겨보세요.</p>
      ) : (
        <ul className="space-y-2.5">
          {comments.map((c) => (
            <li key={c.id} className="bg-[#fafafa] px-3 py-2.5">
              <div className="text-[12px] text-text leading-snug whitespace-pre-wrap break-words mb-1">{c.content}</div>
              <div className="flex items-center gap-2 text-[10px] text-muted">
                <Nickname info={{
                  name: c.author?.display_name ?? null,
                  link: c.author?.link_url ?? null,
                  isPaid: isAuthorPaid(c),
                  isSolo: !!c.author?.is_solo,
                  userId: c.author_id,
                  avatarUrl: c.author?.avatar_url ?? null,
                  aptCount: c.author?.apt_count ?? null,
                }} className="text-muted" />
                <span>·</span>
                <span>{relTime(c.created_at)}</span>
                {me?.id === c.author_id && (
                  <>
                    <span>·</span>
                    <button type="button" onClick={() => remove(c.id)} className="hover:text-red-600">삭제</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
