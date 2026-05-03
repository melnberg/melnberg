'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AptPin } from './AptMap';

type Discussion = {
  id: number;
  title: string;
  content: string | null;
  vote_up_count: number;
  vote_down_count: number;
  created_at: string;
  author_id: string;
};

type Comment = {
  id: number;
  discussion_id: number;
  content: string;
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
  const [comments, setComments] = useState<Map<number, Comment[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  // 마운트 직후 다음 tick에 transform 풀기 → 좌→우 슬라이드 애니메이션
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // 글쓰기 / 수정 폼
  const [writing, setWriting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // 댓글 입력 (글 단위)
  const [commentBody, setCommentBody] = useState<Map<number, string>>(new Map());
  const [openComments, setOpenComments] = useState<Set<number>>(new Set());

  // 점거 상태
  const [occupierId, setOccupierId] = useState<string | null>(null);
  const [occupierName, setOccupierName] = useState<string | null>(null);
  const [occupierScore, setOccupierScore] = useState<number | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [myCurrentApt, setMyCurrentApt] = useState<{ id: number; apt_nm: string } | null>(null);
  const [claiming, setClaiming] = useState(false);

  const supabase = createClient();

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

    const ids = ds.map((d) => d.id);

    // 작가 표시명
    const authorIds = Array.from(new Set(ds.map((d) => d.author_id)));
    if (authorIds.length > 0) {
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

    // 댓글 (글 ID 묶음으로 한 번에 fetch)
    if (ids.length > 0) {
      const { data: cData } = await supabase
        .from('apt_discussion_comments')
        .select('id, discussion_id, content, created_at, author_id')
        .in('discussion_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      const cMap = new Map<number, Comment[]>();
      for (const c of (cData ?? []) as Comment[]) {
        const list = cMap.get(c.discussion_id) ?? [];
        list.push(c);
        cMap.set(c.discussion_id, list);
      }
      setComments(cMap);

      // 댓글 작가도 authors map에 합침
      const commentAuthorIds = Array.from(new Set((cData ?? []).map((c: Comment) => c.author_id))).filter((id) => !authorIds.includes(id));
      if (commentAuthorIds.length > 0) {
        const { data: extra } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', commentAuthorIds);
        if (extra) {
          setAuthors((prev) => {
            const m = new Map(prev);
            for (const p of extra as Array<{ id: string; display_name: string | null }>) {
              if (p.display_name) m.set(p.id, p.display_name);
            }
            return m;
          });
        }
      }
    } else {
      setComments(new Map());
    }

    // 내 vote
    if (user && ids.length > 0) {
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

    // 점거인 + score + 내 현재 점거 fetch
    {
      const { data: occ } = await supabase
        .from('apt_master')
        .select('occupier_id, occupied_at')
        .eq('id', apt.id)
        .maybeSingle();
      const oid = (occ as { occupier_id?: string | null } | null)?.occupier_id ?? null;
      setOccupierId(oid);
      if (oid) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', oid)
          .maybeSingle();
        setOccupierName((prof as { display_name?: string | null } | null)?.display_name ?? null);
        const { data: scoreData } = await supabase.rpc('get_user_score', { p_user_id: oid });
        setOccupierScore(typeof scoreData === 'number' ? scoreData : Number(scoreData ?? 0));
      } else {
        setOccupierName(null);
        setOccupierScore(null);
      }
    }
    // 본인 점수 + 다른 곳 점거중인지
    if (user) {
      const { data: scoreData } = await supabase.rpc('get_user_score', { p_user_id: user.id });
      setMyScore(typeof scoreData === 'number' ? scoreData : Number(scoreData ?? 0));
      const { data: myOccs } = await supabase
        .from('apt_master')
        .select('id, apt_nm')
        .eq('occupier_id', user.id)
        .neq('id', apt.id)
        .limit(1);
      const o = (myOccs as Array<{ id: number; apt_nm: string }> | null)?.[0];
      setMyCurrentApt(o ?? null);
    } else {
      setMyScore(null);
      setMyCurrentApt(null);
    }

    setLoading(false);
  }

  async function claimApt() {
    if (!userId) { alert('점거하려면 로그인이 필요해요.'); return; }
    // 클릭 시점에 fresh fetch — 패널 로딩 중이거나 stale일 때 대비
    const { data: myOccs } = await supabase
      .from('apt_master')
      .select('id, apt_nm')
      .eq('occupier_id', userId)
      .neq('id', apt.id)
      .limit(1);
    const existing = (myOccs as Array<{ id: number; apt_nm: string }> | null)?.[0];
    if (existing) {
      const ok = confirm(`기존에 점거중인 [${existing.apt_nm}]은 자동 퇴거됩니다. 그래도 진행하시겠어요?`);
      if (!ok) return;
    }
    setClaiming(true);
    const { data, error } = await supabase.rpc('claim_apt', { p_apt_id: apt.id });
    setClaiming(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_occupier_id: string | null; out_occupier_name: string | null; out_occupier_score: number | null; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '점거 실패'); return; }
    setOccupierId(row.out_occupier_id);
    setOccupierName(row.out_occupier_name ?? null);
    setOccupierScore(row.out_occupier_score ?? null);
    setMyCurrentApt(null);
  }

  async function forceEvict() {
    if (!userId) { alert('로그인이 필요해요.'); return; }
    if (myScore !== null && occupierScore !== null && myScore <= occupierScore) {
      alert(`점수 부족 — 내 ${myScore} vs 점거인 ${occupierScore}. 강제집행하려면 더 높은 점수가 필요해요.`);
      return;
    }
    // fresh fetch
    const { data: myOccs } = await supabase
      .from('apt_master')
      .select('id, apt_nm')
      .eq('occupier_id', userId)
      .neq('id', apt.id)
      .limit(1);
    const existing = (myOccs as Array<{ id: number; apt_nm: string }> | null)?.[0];
    if (existing) {
      const ok = confirm(`기존에 점거중인 [${existing.apt_nm}]은 자동 퇴거됩니다. 그래도 강제집행하시겠어요?`);
      if (!ok) return;
    } else {
      const ok = confirm(`${occupierName ?? '점거인'} 님을 강제집행해 이 단지를 차지합니다.`);
      if (!ok) return;
    }
    setClaiming(true);
    const { data, error } = await supabase.rpc('force_evict_apt', { p_apt_id: apt.id });
    setClaiming(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_occupier_id: string | null; out_occupier_name: string | null; out_occupier_score: number | null; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '강제집행 실패'); return; }
    setOccupierId(row.out_occupier_id);
    setOccupierName(row.out_occupier_name ?? null);
    setOccupierScore(row.out_occupier_score ?? null);
    setMyCurrentApt(null);
  }

  useEffect(() => {
    let cancelled = false;
    setDiscussions(null);
    setWriting(false);
    setEditingId(null);
    setBody('');
    setSubmitErr(null);
    setOpenComments(new Set());
    setCommentBody(new Map());
    setMyCurrentApt(null);
    setOccupierId(null);
    setOccupierName(null);
    setOccupierScore(null);
    setMyScore(null);
    reload().finally(() => { if (cancelled) return; });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apt.id]);

  async function submitWrite(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) { setSubmitErr('로그인이 필요해요.'); return; }
    const text = body.trim();
    if (!text) { setSubmitErr('내용을 입력해주세요.'); return; }
    const newlineIdx = text.indexOf('\n');
    const titleLine = newlineIdx === -1 ? text : text.slice(0, newlineIdx).trim();
    const restLines = newlineIdx === -1 ? null : text.slice(newlineIdx + 1).trim() || null;
    setSubmitting(true);
    setSubmitErr(null);

    let error;
    if (editingId) {
      ({ error } = await supabase.from('apt_discussions').update({
        title: titleLine.slice(0, 200),
        content: restLines,
      }).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('apt_discussions').insert({
        apt_master_id: apt.id,
        author_id: userId,
        title: titleLine.slice(0, 200),
        content: restLines,
      }));
    }

    if (error) { setSubmitErr(error.message); setSubmitting(false); return; }
    setSubmitting(false);
    setWriting(false);
    setEditingId(null);
    setBody('');
    await reload();
  }

  function startEdit(d: Discussion) {
    setEditingId(d.id);
    setBody(d.content ? `${d.title}\n${d.content}` : d.title);
    setWriting(true);
  }

  async function deleteDiscussion(id: number) {
    if (!confirm('이 글을 삭제하시겠어요?')) return;
    const { error } = await supabase.rpc('delete_apt_discussion', { p_id: id });
    if (error) { alert(error.message); return; }
    await reload();
  }

  async function vote(discussionId: number, type: 'up' | 'down') {
    if (!userId) { alert('추천하려면 로그인이 필요해요.'); return; }
    const current = myVotes.get(discussionId);
    if (current === type) {
      const { error } = await supabase
        .from('apt_discussion_votes').delete()
        .eq('discussion_id', discussionId).eq('user_id', userId);
      if (error) { alert(error.message); return; }
    } else if (current) {
      const { error } = await supabase
        .from('apt_discussion_votes').update({ vote_type: type })
        .eq('discussion_id', discussionId).eq('user_id', userId);
      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase
        .from('apt_discussion_votes')
        .insert({ discussion_id: discussionId, user_id: userId, vote_type: type });
      if (error) { alert(error.message); return; }
    }
    await reload();
  }

  function toggleComments(id: number) {
    setOpenComments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitComment(discussionId: number) {
    if (!userId) { alert('로그인이 필요해요.'); return; }
    const text = (commentBody.get(discussionId) ?? '').trim();
    if (!text) return;
    const { error } = await supabase.from('apt_discussion_comments').insert({
      discussion_id: discussionId, author_id: userId, content: text,
    });
    if (error) { alert(error.message); return; }
    setCommentBody((prev) => { const m = new Map(prev); m.set(discussionId, ''); return m; });
    await reload();
  }

  async function deleteComment(commentId: number) {
    if (!confirm('이 댓글을 삭제하시겠어요?')) return;
    const { error } = await supabase.rpc('delete_apt_discussion_comment', { p_id: commentId });
    if (error) { alert(error.message); return; }
    await reload();
  }

  return (
    <aside className={`absolute top-0 left-0 h-full w-[380px] max-w-full bg-white border-r border-border shadow-[8px_0_24px_rgba(0,0,0,0.06)] flex flex-col z-30 transition-transform duration-200 ease-out ${shown ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* 우측 가장자리 닫기 탭 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute top-1/2 -right-7 -translate-y-1/2 w-7 h-16 bg-white border border-l-0 border-border flex items-center justify-center text-navy hover:bg-navy-soft transition-colors shadow-[4px_0_8px_rgba(0,0,0,0.06)]"
        title="닫기"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold tracking-wider text-cyan uppercase">{apt.dong ?? ''}</div>
            <h2 className="text-[18px] font-bold text-navy tracking-tight">{apt.apt_nm}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="w-10 h-10 flex items-center justify-center text-navy hover:bg-navy-soft transition-colors flex-shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 단지 정보 (한국부동산원 ODcloud) */}
        {(apt.household_count || apt.building_count || apt.kapt_build_year || apt.geocoded_address) && (
          <div className="mt-3 pt-3 border-t border-[#f0f0f0] grid grid-cols-3 gap-2">
            {apt.household_count && (
              <div>
                <div className="text-[#666] text-[12px] font-medium">세대수</div>
                <div className="font-bold text-black text-[16px]">{apt.household_count.toLocaleString()}</div>
              </div>
            )}
            {apt.building_count && (
              <div>
                <div className="text-[#666] text-[12px] font-medium">동수</div>
                <div className="font-bold text-black text-[16px]">{apt.building_count}개</div>
              </div>
            )}
            {apt.kapt_build_year && (
              <div>
                <div className="text-[#666] text-[12px] font-medium">준공</div>
                <div className="font-bold text-black text-[16px]">{apt.kapt_build_year}년</div>
              </div>
            )}
            {apt.geocoded_address && (
              <div className="col-span-3 pt-2 border-t border-[#f5f5f5]">
                <div className="text-[#666] text-[12px] font-medium">주소</div>
                <div className="text-black text-[14px] leading-snug font-medium">{apt.geocoded_address}</div>
              </div>
            )}
          </div>
        )}

        {/* 점거 상태 + 버튼 */}
        <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
          {occupierId ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#00B0F0" className="flex-shrink-0"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
                <span className="text-[12px] text-[#666] font-medium flex-shrink-0">점거인</span>
                <span className="text-[14px] font-bold text-black truncate">{occupierName ?? '익명'}</span>
                {/* 도움말 — hover 시 점거 규칙 안내 */}
                <span className="relative group flex-shrink-0">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted text-muted text-[10px] font-bold cursor-help hover:border-navy hover:text-navy">?</span>
                  <div className="hidden group-hover:block absolute z-50 left-1/2 -translate-x-1/2 top-6 w-[280px] bg-navy text-white text-[11px] leading-relaxed p-3 shadow-xl">
                    <div className="font-bold text-cyan mb-1.5">점거 규칙</div>
                    <div className="mb-2">
                      <div className="font-bold mb-0.5">📌 Score 산정</div>
                      <div>• 작성글 1점 + 댓글 0.7점</div>
                    </div>
                    <div className="mb-2">
                      <div className="font-bold mb-0.5">🚪 점거</div>
                      <div>빈 단지 → 누구나 점거 가능</div>
                    </div>
                    <div className="mb-2">
                      <div className="font-bold mb-0.5">⚔️ 강제집행 (박탈)</div>
                      <div>• 조건: 내 score &gt; 점거인 score</div>
                      <div>• 동점이면 박탈 불가</div>
                    </div>
                    <div>
                      <div className="font-bold mb-0.5">🔄 점거 옮기기</div>
                      <div>1인 1점거 — 새 단지 점거 시 기존 단지에서 자동 퇴거</div>
                    </div>
                  </div>
                </span>
                {occupierScore !== null && (
                  <span className="text-[11px] text-muted flex-shrink-0">(score {occupierScore})</span>
                )}
              </div>
              {occupierId === userId ? (
                <span className="text-[11px] font-bold text-cyan flex-shrink-0">내가 점거중</span>
              ) : userId ? (
                <span className="relative group flex-shrink-0">
                  <button
                    type="button"
                    onClick={forceEvict}
                    disabled={claiming || (myScore !== null && occupierScore !== null && myScore <= occupierScore)}
                    className="text-[11px] font-bold px-2.5 py-1 bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    강제집행
                  </button>
                  {/* 호버 시 강제집행 조건 + 점수 비교 */}
                  <div className="hidden group-hover:block absolute z-50 right-0 top-8 w-[240px] bg-navy text-white text-[11px] leading-relaxed p-3 shadow-xl">
                    <div className="font-bold text-cyan mb-1.5">⚔️ 강제집행 (박탈)</div>
                    <div className="mb-0.5">• 조건: 내 score &gt; 점거인 score</div>
                    <div className="mb-2">• 동점이면 박탈 불가</div>
                    <div className="pt-2 border-t border-white/20 space-y-0.5">
                      {myScore !== null && (
                        <div className="flex justify-between"><span>내 score</span><b>{myScore}</b></div>
                      )}
                      {occupierScore !== null && (
                        <div className="flex justify-between"><span>점거인 score</span><b>{occupierScore}</b></div>
                      )}
                      {myScore !== null && occupierScore !== null && myScore <= occupierScore && (
                        <div className="text-[10px] text-cyan mt-1.5">글·댓글로 score 올린 후 다시 시도.</div>
                      )}
                    </div>
                  </div>
                </span>
              ) : (
                <Link href="/login" className="text-[11px] font-bold text-cyan no-underline flex-shrink-0">
                  로그인
                </Link>
              )}
            </div>
          ) : userId ? (
            <button
              type="button"
              onClick={claimApt}
              disabled={claiming}
              className="w-full bg-cyan text-white py-2.5 text-[13px] font-bold tracking-wide hover:bg-cyan-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
              <span>{claiming ? '점거중...' : '이 단지 점거하기'}</span>
            </button>
          ) : (
            <Link
              href="/login"
              className="block w-full bg-white border border-cyan text-cyan py-2.5 text-[13px] font-bold tracking-wide hover:bg-navy-soft text-center no-underline"
            >
              로그인하고 점거하기
            </Link>
          )}
        </div>
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
          <ul className="px-4 py-4 space-y-3">
            {discussions.map((d) => {
              const score = d.vote_up_count - d.vote_down_count;
              const author = authors.get(d.author_id) ?? d.author_id.slice(0, 6);
              const myVote = myVotes.get(d.id);
              const isMine = userId === d.author_id;
              const dComments = comments.get(d.id) ?? [];
              const isCommentsOpen = openComments.has(d.id);
              return (
                <li key={d.id} className="border border-navy/30 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,32,96,0.10)] hover:shadow-[0_2px_10px_rgba(0,32,96,0.14)] transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[14px] font-bold text-navy leading-snug flex-1">{d.title}</h3>
                    <div className={`text-[13px] font-bold flex-shrink-0 ${score > 0 ? 'text-cyan' : score < 0 ? 'text-red-500' : 'text-muted'}`}>
                      {score > 0 ? '+' : ''}{score}
                    </div>
                  </div>
                  {d.content && (
                    <p className="text-[14px] text-text mt-1 leading-snug whitespace-pre-wrap">{d.content}</p>
                  )}
                  <div className="text-[11px] text-muted mt-2 flex items-center gap-2">
                    <span>{author}</span>
                    <span>·</span>
                    <span>{relativeTime(d.created_at)}</span>
                    {isMine && (
                      <>
                        <span>·</span>
                        <button type="button" onClick={() => startEdit(d)} className="text-muted hover:text-navy">수정</button>
                        <span>·</span>
                        <button type="button" onClick={() => deleteDiscussion(d.id)} className="text-muted hover:text-red-500">삭제</button>
                      </>
                    )}
                  </div>
                  {/* 좌: 댓글 / 우: 하트 */}
                  <div className="mt-2.5 flex items-center justify-between">
                    <button type="button" onClick={() => toggleComments(d.id)}
                      className="flex items-center gap-1.5 text-[13px] text-text font-medium hover:text-navy transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span>댓글 {dComments.length}</span>
                    </button>
                    <button type="button" onClick={() => vote(d.id, 'up')}
                      className={`flex items-center gap-1.5 text-[13px] font-medium transition-colors ${myVote === 'up' ? 'text-red-500' : 'text-text hover:text-red-500'}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={myVote === 'up' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                      <span>{d.vote_up_count}</span>
                    </button>
                  </div>

                  {/* 댓글 목록 + 입력 */}
                  {isCommentsOpen && (
                    <div className="mt-3 pt-3 border-t border-[#f0f0f0] space-y-2">
                      {dComments.map((c) => {
                        const cAuthor = authors.get(c.author_id) ?? c.author_id.slice(0, 6);
                        const cIsMine = userId === c.author_id;
                        return (
                          <div key={c.id} className="text-[12px]">
                            <p className="text-text whitespace-pre-wrap leading-snug">{c.content}</p>
                            <div className="text-[10px] text-muted mt-0.5 flex items-center gap-1.5">
                              <span>{cAuthor}</span>
                              <span>·</span>
                              <span>{relativeTime(c.created_at)}</span>
                              {cIsMine && (
                                <>
                                  <span>·</span>
                                  <button type="button" onClick={() => deleteComment(c.id)} className="hover:text-red-500">삭제</button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {userId ? (
                        <div className="flex gap-1.5 mt-2">
                          <input
                            type="text"
                            value={commentBody.get(d.id) ?? ''}
                            onChange={(e) => setCommentBody((prev) => { const m = new Map(prev); m.set(d.id, e.target.value); return m; })}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitComment(d.id); } }}
                            placeholder="댓글을 입력..."
                            maxLength={500}
                            className="flex-1 px-2.5 py-1.5 border border-border bg-white text-[12px] focus:outline-none focus:border-navy"
                          />
                          <button type="button" onClick={() => submitComment(d.id)}
                            className="px-3 py-1.5 bg-navy text-white text-[12px] font-bold hover:bg-navy-dark">
                            등록
                          </button>
                        </div>
                      ) : (
                        <Link href="/login" className="block mt-2 text-[11px] text-muted hover:text-navy text-center py-1.5 border border-border no-underline">
                          댓글 달려면 로그인
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* 글쓰기 / 수정 폼 */}
        {writing && (
          <form onSubmit={submitWrite} className="px-6 py-5 border-t border-border bg-[#fafafa]">
            <div className="text-[11px] font-bold text-muted mb-2 uppercase tracking-wider">
              {editingId ? '글 수정' : '새 글'}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="첫 줄이 제목이 됩니다. 줄바꿈하면 그 아래는 본문."
              maxLength={2000}
              rows={7}
              className="w-full px-3 py-2 border border-border bg-white text-sm focus:outline-none focus:border-navy resize-none"
              required
              autoFocus
            />
            {submitErr && <p className="mt-2 text-xs text-red-600">{submitErr}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button"
                onClick={() => { setWriting(false); setEditingId(null); setBody(''); setSubmitErr(null); }}
                className="flex-1 py-2 border border-border text-text text-sm font-medium hover:border-navy"
                disabled={submitting}>
                취소
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 py-2 bg-navy text-white text-sm font-bold hover:bg-navy-dark disabled:opacity-50">
                {submitting ? '등록중...' : editingId ? '수정' : '등록'}
              </button>
            </div>
          </form>
        )}
      </div>

      {!writing && (
        <div className="border-t border-border px-6 py-4">
          {userId ? (
            <button type="button" onClick={() => setWriting(true)}
              className="w-full bg-navy text-white py-3 px-4 text-sm font-bold tracking-wide hover:bg-navy-dark transition-colors">
              글쓰기
            </button>
          ) : (
            <Link href="/login"
              className="block w-full bg-white border border-navy text-navy py-3 px-4 text-sm font-bold tracking-wide hover:bg-navy-soft text-center no-underline">
              로그인하고 글쓰기
            </Link>
          )}
        </div>
      )}
    </aside>
  );
}
