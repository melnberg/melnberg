'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AptPin } from './AptMap';

type Discussion = {
  id: number;
  title: string;
  content: string;
  vote_up_count: number;
  vote_down_count: number;
  created_at: string;
  author_id: string;
};

type MyVote = { discussion_id: number; vote_type: 'up' | 'down' };

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return '방금';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return iso.slice(0, 10);
}

export default function AptDiscussionPanel({ apt, onClose }: { apt: AptPin; onClose: () => void }) {
  const [discussions, setDiscussions] = useState<Discussion[] | null>(null);
  const [myVotes, setMyVotes] = useState<Map<number, 'up' | 'down'>>(new Map());
  const [authors, setAuthors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // 글쓰기 폼 상태
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const supabase = createClient();

  // 글 목록 + 내 vote + 로그인 사용자 fetch
  async function reload() {
    setLoading(true);
    setErr(null);

    const [{ data: dData, error: dErr }, { data: { user } }] = await Promise.all([
      supabase
        .from('apt_discussions')
        .select('id, title, content, vote_up_count, vote_down_count, created_at, author_id')
        .eq('apt_master_id', apt.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.auth.getUser(),
    ]);

    if (dErr) { setErr(dErr.message); setLoading(false); return; }
    const ds = (dData ?? []) as unknown as Discussion[];
    setDiscussions(ds);
    setUserId(user?.id ?? null);

    // 작가 표시명 fetch — apt_discussions.author_id FK가 auth.users라 join 안 되서 별도 lookup
    if (ds.length > 0) {
      const authorIds = Array.from(new Set(ds.map((d) => d.author_id)));
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', authorIds);
      const aMap = new Map<string, string>();
      for (const p of (profilesData ?? []) as Array<{ id: string; display_name: string | null }>) {
        if (p.display_name) aMap.set(p.id, p.display_name);
      }
      setAuthors(aMap);
    } else {
      setAuthors(new Map());
    }

    // 내 vote 가져오기 (로그인 한 경우만)
    if (user && ds.length > 0) {
      const ids = ds.map((d) => d.id);
      const { data: vData } = await supabase
        .from('apt_discussion_votes')
        .select('discussion_id, vote_type')
        .eq('user_id', user.id)
        .in('discussion_id', ids);
      const map = new Map<number, 'up' | 'down'>();
      for (const v of (vData ?? []) as MyVote[]) map.set(v.discussion_id, v.vote_type);
      setMyVotes(map);
    } else {
      setMyVotes(new Map());
    }

    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    setDiscussions(null);
    setWriting(false);
    setTitle('');
    setContent('');
    setSubmitErr(null);
    reload().finally(() => { if (cancelled) return; });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apt.id]);

  async function submitWrite(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) { setSubmitErr('로그인이 필요해요.'); return; }
    if (!title.trim() || !content.trim()) { setSubmitErr('제목과 내용을 모두 입력해주세요.'); return; }
    setSubmitting(true);
    setSubmitErr(null);
    const { error } = await supabase.from('apt_discussions').insert({
      apt_master_id: apt.id,
      author_id: userId,
      title: title.trim(),
      content: content.trim(),
    });
    if (error) { setSubmitErr(error.message); setSubmitting(false); return; }
    setSubmitting(false);
    setWriting(false);
    setTitle('');
    setContent('');
    await reload();
  }

  async function vote(discussionId: number, type: 'up' | 'down') {
    if (!userId) { alert('추천하려면 로그인이 필요해요.'); return; }
    const current = myVotes.get(discussionId);

    // 같은 vote 다시 누르면 취소
    if (current === type) {
      const { error } = await supabase
        .from('apt_discussion_votes')
        .delete()
        .eq('discussion_id', discussionId)
        .eq('user_id', userId);
      if (error) { alert(error.message); return; }
    } else if (current) {
      // 다른 vote에서 전환
      const { error } = await supabase
        .from('apt_discussion_votes')
        .update({ vote_type: type })
        .eq('discussion_id', discussionId)
        .eq('user_id', userId);
      if (error) { alert(error.message); return; }
    } else {
      // 새로 vote
      const { error } = await supabase
        .from('apt_discussion_votes')
        .insert({ discussion_id: discussionId, user_id: userId, vote_type: type });
      if (error) { alert(error.message); return; }
    }
    await reload();
  }

  return (
    <aside className="absolute top-0 right-0 h-full w-[380px] max-w-full bg-white border-l border-border shadow-[-8px_0_24px_rgba(0,0,0,0.06)] flex flex-col z-30">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-cyan uppercase">{apt.dong ?? ''}</div>
          <h2 className="text-[18px] font-bold text-navy tracking-tight">{apt.apt_nm}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="w-8 h-8 flex items-center justify-center text-muted hover:text-navy"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="px-6 py-12 text-sm text-muted">불러오는 중...</div>}

        {err && <div className="px-6 py-12 text-sm text-red-600">에러: {err}</div>}

        {!loading && !err && discussions && discussions.length === 0 && !writing && (
          <div className="px-6 py-12 text-sm text-muted leading-relaxed">
            아직 이 단지에 대한 글이 없어요.<br />첫 글로 평가·후기를 남겨보세요.
          </div>
        )}

        {!loading && !err && discussions && discussions.length > 0 && (
          <ul className="divide-y divide-[#f0f0f0]">
            {discussions.map((d) => {
              const score = d.vote_up_count - d.vote_down_count;
              const author = authors.get(d.author_id) ?? d.author_id.slice(0, 6);
              const myVote = myVotes.get(d.id);
              return (
                <li key={d.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[14px] font-bold text-navy leading-snug flex-1">{d.title}</h3>
                    <div className={`text-[13px] font-bold flex-shrink-0 ${score > 0 ? 'text-cyan' : score < 0 ? 'text-red-500' : 'text-muted'}`}>
                      {score > 0 ? '+' : ''}{score}
                    </div>
                  </div>
                  <p className="text-[12px] text-text mt-1.5 leading-relaxed whitespace-pre-wrap">{d.content}</p>
                  <div className="text-[11px] text-muted mt-2 flex items-center gap-2">
                    <span>{author}</span>
                    <span>·</span>
                    <span>{relativeTime(d.created_at)}</span>
                  </div>
                  {/* 추천/비추천 */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => vote(d.id, 'up')}
                      className={`flex items-center gap-1 px-2.5 py-1 border text-[12px] font-medium transition-colors ${myVote === 'up' ? 'border-cyan bg-cyan text-white' : 'border-border text-text hover:border-cyan hover:text-cyan'}`}
                    >
                      <span>↑</span><span>{d.vote_up_count}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => vote(d.id, 'down')}
                      className={`flex items-center gap-1 px-2.5 py-1 border text-[12px] font-medium transition-colors ${myVote === 'down' ? 'border-red-500 bg-red-500 text-white' : 'border-border text-text hover:border-red-500 hover:text-red-500'}`}
                    >
                      <span>↓</span><span>{d.vote_down_count}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* 글쓰기 폼 */}
        {writing && (
          <form onSubmit={submitWrite} className="px-6 py-5 border-t border-border bg-[#fafafa]">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
              maxLength={100}
              className="w-full px-3 py-2 border border-border bg-white text-sm focus:outline-none focus:border-navy"
              required
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="이 단지에 대한 평가·후기를 자유롭게..."
              maxLength={2000}
              rows={6}
              className="w-full mt-2 px-3 py-2 border border-border bg-white text-sm focus:outline-none focus:border-navy resize-none"
              required
            />
            {submitErr && <p className="mt-2 text-xs text-red-600">{submitErr}</p>}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => { setWriting(false); setTitle(''); setContent(''); setSubmitErr(null); }}
                className="flex-1 py-2 border border-border text-text text-sm font-medium hover:border-navy"
                disabled={submitting}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2 bg-navy text-white text-sm font-bold hover:bg-navy-dark disabled:opacity-50"
              >
                {submitting ? '등록중...' : '등록'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 하단 글쓰기 버튼 */}
      {!writing && (
        <div className="border-t border-border px-6 py-4">
          {userId ? (
            <button
              type="button"
              onClick={() => setWriting(true)}
              className="w-full bg-navy text-white py-3 px-4 text-sm font-bold tracking-wide hover:bg-navy-dark transition-colors"
            >
              글쓰기
            </button>
          ) : (
            <Link
              href="/login"
              className="block w-full bg-white border border-navy text-navy py-3 px-4 text-sm font-bold tracking-wide hover:bg-navy-soft text-center no-underline"
            >
              로그인하고 글쓰기
            </Link>
          )}
        </div>
      )}
    </aside>
  );
}
