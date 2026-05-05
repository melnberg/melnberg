'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Nickname, { type NicknameInfo } from './Nickname';
import type { AptPin } from './AptMap';
import { getAptListingPrice } from '@/lib/listing-price';
import { awardMlbg, awardToastMessage } from '@/lib/mlbg-award';
import { notifyTelegram } from '@/lib/telegram-notify';

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
  parent_id: number | null;
};

type MyVote = { discussion_id: number; vote_type: 'up' | 'down' };

type HistoryEvent = {
  occurred_at: string;
  event: 'claim' | 'evict' | 'vacate';
  actor_name: string | null;
  prev_occupier_name: string | null;
  actor_score: number | null;
  prev_score: number | null;
};

function fmtHistoryTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

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
  const router = useRouter();
  const [discussions, setDiscussions] = useState<Discussion[] | null>(null);
  const [myVotes, setMyVotes] = useState<Map<number, 'up' | 'down'>>(new Map());
  const [authors, setAuthors] = useState<Map<string, NicknameInfo>>(new Map());
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
  // 답글 입력 — 부모 댓글 id 기준으로 본문/열림 상태 관리
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState('');

  // 점거 상태
  const [occupierId, setOccupierId] = useState<string | null>(null);
  const [occupierName, setOccupierName] = useState<string | null>(null);
  const [occupierLink, setOccupierLink] = useState<string | null>(null);
  const [occupierIsPaid, setOccupierIsPaid] = useState<boolean>(false);
  const [occupierIsSolo, setOccupierIsSolo] = useState<boolean>(false);
  const [occupierAptCount, setOccupierAptCount] = useState<number | null>(null);
  const [occupierScore, setOccupierScore] = useState<number | null>(null);
  const [occupierMlbg, setOccupierMlbg] = useState<number | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [myCurrentApt, setMyCurrentApt] = useState<{ id: number; apt_nm: string } | null>(null);
  const [claiming, setClaiming] = useState(false);

  // 매물 (P2P 매매)
  const [listingPrice, setListingPrice] = useState<number | null>(null);
  const [sellPanelOpen, setSellPanelOpen] = useState(false);
  const [sellPriceInput, setSellPriceInput] = useState('');
  const [trading, setTrading] = useState(false);
  const [myMlbgBalance, setMyMlbgBalance] = useState<number | null>(null);

  // 점거 히스토리
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEvent[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const supabase = createClient();

  async function toggleHistory() {
    if (historyOpen) { setHistoryOpen(false); return; }
    setHistoryOpen(true);
    if (history !== null) return;
    setHistoryLoading(true);
    const { data, error } = await supabase.rpc('get_apt_history', { p_apt_id: apt.id });
    setHistoryLoading(false);
    if (error) { setHistory([]); return; }
    setHistory((data ?? []) as HistoryEvent[]);
  }

  async function reload() {
    setLoading(true);
    setErr(null);

    // Round 1: 글 + 사용자 + 점거인 정보 + apt_master + 매물 동시 fetch
    const [{ data: dData, error: dErr }, { data: { user } }, { data: occData }, { data: listingData }] = await Promise.all([
      supabase
        .from('apt_discussions')
        .select('id, title, content, vote_up_count, vote_down_count, created_at, author_id')
        .eq('apt_master_id', apt.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.auth.getUser(),
      supabase.from('apt_master').select('occupier_id, occupied_at').eq('id', apt.id).maybeSingle(),
      supabase.from('apt_listings').select('price').eq('apt_id', apt.id).maybeSingle(),
    ]);
    const lp = (listingData as { price?: number | string | null } | null)?.price;
    setListingPrice(lp == null ? null : Number(lp));

    if (dErr) { setErr(dErr.message); setLoading(false); return; }
    const ds = (dData ?? []) as unknown as Discussion[];
    setDiscussions(ds);
    setUserId(user?.id ?? null);
    const oid = (occData as { occupier_id?: string | null } | null)?.occupier_id ?? null;
    setOccupierId(oid);

    const ids = ds.map((d) => d.id);
    const authorIds = Array.from(new Set(ds.map((d) => d.author_id)));
    const nowMs = Date.now();
    const toInfo = (p: { id?: string; display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo?: boolean | null; avatar_url?: string | null; apt_count?: number | null }): NicknameInfo => ({
      name: p.display_name,
      link: p.link_url,
      isPaid: p.tier === 'paid' && (!p.tier_expires_at || new Date(p.tier_expires_at).getTime() > nowMs),
      isSolo: !!p.is_solo,
      userId: p.id ?? null,
      avatarUrl: p.avatar_url ?? null,
      aptCount: p.apt_count ?? null,
    });

    // Round 2: 댓글 + 글 작성자 프로필 + 본인 점수·점거·vote + 점거인 점수 모두 병렬
    const [
      { data: cData },
      { data: discAuthorProfs },
      { data: myScoreData },
      { data: myOccsData },
      { data: myVotesData },
      { data: occScoreData },
    ] = await Promise.all([
      ids.length > 0
        ? supabase.from('apt_discussion_comments').select('id, discussion_id, content, created_at, author_id, parent_id').in('discussion_id', ids).is('deleted_at', null).order('created_at', { ascending: true })
        : Promise.resolve({ data: [] as Comment[] | null }),
      authorIds.length > 0
        ? supabase.from('profiles').select('id, display_name, link_url, tier, tier_expires_at, is_solo, avatar_url, apt_count').in('id', authorIds)
        : Promise.resolve({ data: [] as unknown[] | null }),
      user ? supabase.rpc('get_user_score', { p_user_id: user.id }) : Promise.resolve({ data: null }),
      user ? supabase.from('apt_master').select('id, apt_nm').eq('occupier_id', user.id).neq('id', apt.id).limit(1) : Promise.resolve({ data: null }),
      user && ids.length > 0
        ? supabase.from('apt_discussion_votes').select('discussion_id, vote_type').eq('user_id', user.id).in('discussion_id', ids)
        : Promise.resolve({ data: null }),
      oid ? supabase.rpc('get_user_score', { p_user_id: oid }) : Promise.resolve({ data: null }),
    ]);

    // 댓글 처리
    const cList = (cData ?? []) as Comment[];
    const cMap = new Map<number, Comment[]>();
    for (const c of cList) {
      const list = cMap.get(c.discussion_id) ?? [];
      list.push(c);
      cMap.set(c.discussion_id, list);
    }
    setComments(cMap);

    // 글 작성자 프로필 처리
    const aMap = new Map<string, NicknameInfo>();
    for (const p of (discAuthorProfs ?? []) as Array<{ id: string; display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo: boolean | null; avatar_url: string | null; apt_count: number | null }>) {
      if (p.display_name) aMap.set(p.id, toInfo(p));
    }

    // 댓글 작성자 중 글 작성자에 없는 사람들 — 추가 round
    const commentAuthorIds = Array.from(new Set(cList.map((c) => c.author_id))).filter((id) => !authorIds.includes(id));
    // 점거인이 글 작성자/댓글 작성자에 없으면 같이 가져옴
    const occNeedFetch = oid && !authorIds.includes(oid) && !commentAuthorIds.includes(oid);
    const extraIds = [...commentAuthorIds];
    if (occNeedFetch && oid) extraIds.push(oid);

    if (extraIds.length > 0) {
      const { data: extra } = await supabase
        .from('profiles')
        .select('id, display_name, link_url, tier, tier_expires_at, is_solo, avatar_url, apt_count')
        .in('id', extraIds);
      for (const p of (extra ?? []) as Array<{ id: string; display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo: boolean | null; avatar_url: string | null; apt_count: number | null }>) {
        if (p.display_name) aMap.set(p.id, toInfo(p));
        // 점거인이면 별도 state 도 set
        if (p.id === oid) {
          setOccupierName(p.display_name ?? null);
          setOccupierLink(p.link_url ?? null);
          setOccupierIsPaid(p.tier === 'paid' && (!p.tier_expires_at || new Date(p.tier_expires_at).getTime() > nowMs));
          setOccupierIsSolo(!!p.is_solo);
          setOccupierAptCount(p.apt_count ?? null);
        }
      }
    }

    // 점거인이 작성자 목록에 이미 있으면 거기서 가져옴
    if (oid && !occNeedFetch) {
      const occInfo = aMap.get(oid);
      if (occInfo) {
        setOccupierName(occInfo.name ?? null);
        setOccupierLink(occInfo.link ?? null);
        setOccupierIsPaid(!!occInfo.isPaid);
        setOccupierIsSolo(!!occInfo.isSolo);
        setOccupierAptCount(occInfo.aptCount ?? null);
      }
    } else if (!oid) {
      setOccupierName(null);
      setOccupierLink(null);
      setOccupierIsPaid(false);
      setOccupierIsSolo(false);
      setOccupierAptCount(null);
    }
    setOccupierScore(typeof occScoreData === 'number' ? occScoreData : occScoreData != null ? Number(occScoreData) : null);
    setAuthors(aMap);

    // 내 vote map
    const vMap = new Map<number, 'up' | 'down'>();
    for (const v of (myVotesData ?? []) as MyVote[]) vMap.set(v.discussion_id, v.vote_type);
    setMyVotes(vMap);

    // 본인 score / 다른 곳 점거
    setMyScore(typeof myScoreData === 'number' ? myScoreData : myScoreData != null ? Number(myScoreData) : null);
    const myOccs = (myOccsData as Array<{ id: number; apt_nm: string }> | null)?.[0] ?? null;
    setMyCurrentApt(myOccs);

    // 본인 mlbg_balance — 매수 가능 여부 표시용
    if (user) {
      const { data: profBal } = await supabase.from('profiles').select('mlbg_balance').eq('id', user.id).maybeSingle();
      const v = (profBal as { mlbg_balance?: number | string | null } | null)?.mlbg_balance;
      setMyMlbgBalance(v == null ? 0 : Number(v));
    } else {
      setMyMlbgBalance(null);
    }

    // 점거인 mlbg_balance — 패널에 표시
    if (oid) {
      const { data: occBal } = await supabase.from('profiles').select('mlbg_balance').eq('id', oid).maybeSingle();
      const v = (occBal as { mlbg_balance?: number | string | null } | null)?.mlbg_balance;
      setOccupierMlbg(v == null ? null : Number(v));
    } else {
      setOccupierMlbg(null);
    }

    setLoading(false);
    // 사이드바 score(서버 컴포넌트)도 갱신되도록 RSC 재요청
    router.refresh();
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
    const price = getAptListingPrice(apt.lawd_cd);
    if (!confirm(`이 단지를 ${price} mlbg에 분양받습니다. 진행할까요?`)) return;
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
    setHistory(null); // 다음 열기 시 재fetch
    // 홈 지도 핀 캐시 무효화 신호 (점거 마커 즉시 갱신)
    window.dispatchEvent(new Event('mlbg-pins-changed'));
    // 차감된 mlbg 잔액 즉시 반영 — 패널 + 사이드바 (router.refresh)
    await reload();
  }

  async function listForSale() {
    if (!userId) return;
    const price = Number(sellPriceInput);
    if (!Number.isFinite(price) || price <= 0) { alert('가격을 0보다 큰 숫자로 입력하세요.'); return; }
    setTrading(true);
    const { data, error } = await supabase.rpc('list_apt_for_sale', { p_apt_id: apt.id, p_price: price });
    setTrading(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '매물 등록 실패'); return; }
    setListingPrice(price);
    setSellPanelOpen(false);
    setSellPriceInput('');
    window.dispatchEvent(new Event('mlbg-pins-changed'));
  }

  async function unlist() {
    if (!userId) return;
    if (!confirm('매물 등록을 해제할까요?')) return;
    setTrading(true);
    const { data, error } = await supabase.rpc('unlist_apt', { p_apt_id: apt.id });
    setTrading(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '해제 실패'); return; }
    setListingPrice(null);
    window.dispatchEvent(new Event('mlbg-pins-changed'));
  }

  async function buyApt() {
    if (!userId || listingPrice == null) return;
    if (!confirm(`이 단지를 ${listingPrice.toLocaleString()} mlbg 에 매수합니다. 진행할까요?`)) return;
    setTrading(true);
    const { data, error } = await supabase.rpc('buy_apt', { p_apt_id: apt.id });
    setTrading(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_seller_id: string | null; out_seller_name: string | null; out_price: number | null; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '매수 실패'); return; }
    alert(`매수 완료. ${row.out_seller_name ?? ''} 님으로부터 ${row.out_price ?? listingPrice} mlbg 에 인수했습니다.`);
    setListingPrice(null);
    setOccupierId(userId);
    setHistory(null);
    await reload();
    window.dispatchEvent(new Event('mlbg-pins-changed'));
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
    setHistory(null);
    window.dispatchEvent(new Event('mlbg-pins-changed'));
    await reload();
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
    setHistoryOpen(false);
    setHistory(null);
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
    let insertedId: number | null = null;
    if (editingId) {
      ({ error } = await supabase.from('apt_discussions').update({
        title: titleLine.slice(0, 200),
        content: restLines,
      }).eq('id', editingId));
    } else {
      const ins = await supabase.from('apt_discussions').insert({
        apt_master_id: apt.id,
        author_id: userId,
        title: titleLine.slice(0, 200),
        content: restLines,
      }).select('id').single();
      error = ins.error;
      insertedId = (ins.data as { id: number } | null)?.id ?? null;
    }

    if (error) { setSubmitErr(error.message); setSubmitting(false); return; }
    if (insertedId) {
      const award = await awardMlbg('apt_post', insertedId, [titleLine, restLines ?? ''].join('\n').trim());
      const msg = awardToastMessage(award);
      if (msg) alert(msg);
      notifyTelegram('apt_post', insertedId);
    }
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
    const { data, error } = await supabase.from('apt_discussion_comments').insert({
      discussion_id: discussionId, author_id: userId, content: text,
    }).select('id').single();
    if (error) { alert(error.message); return; }
    setCommentBody((prev) => { const m = new Map(prev); m.set(discussionId, ''); return m; });
    const cid = (data as { id: number } | null)?.id;
    if (cid) {
      awardMlbg('apt_comment', cid, text).then((r) => {
        const msg = awardToastMessage(r);
        if (msg && r.ok && r.multiplier <= 0.3) alert(msg);
      });
      notifyTelegram('apt_comment', cid);
    }
    await reload();
  }

  async function submitReply(discussionId: number, parentId: number) {
    if (!userId) { alert('로그인이 필요해요.'); return; }
    const text = replyBody.trim();
    if (!text) return;
    const { data, error } = await supabase.from('apt_discussion_comments').insert({
      discussion_id: discussionId, author_id: userId, content: text, parent_id: parentId,
    }).select('id').single();
    if (error) { alert(error.message); return; }
    setReplyBody('');
    setReplyTo(null);
    const cid = (data as { id: number } | null)?.id;
    if (cid) {
      awardMlbg('apt_comment', cid, text).then((r) => {
        const msg = awardToastMessage(r);
        if (msg && r.ok && r.multiplier <= 0.3) alert(msg);
      });
      notifyTelegram('apt_comment', cid);
    }
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
        className="absolute top-1/2 -right-7 -translate-y-1/2 w-7 h-16 bg-white border border-l-0 border-border flex items-center justify-center text-navy hover:border-navy hover:text-navy-dark shadow-[4px_0_8px_rgba(0,0,0,0.06)]"
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
            <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#00B0F0" className="flex-shrink-0"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
                <span className="text-[12px] text-[#666] font-medium flex-shrink-0">점거인</span>
                <span className="text-[14px] font-bold text-black truncate">
                  <Nickname info={{ name: occupierName, link: occupierLink, isPaid: occupierIsPaid, isSolo: occupierIsSolo, userId: occupierId, aptCount: occupierAptCount }} />
                </span>
                {/* 도움말 — hover 시 점거 규칙 안내 */}
                <span className="relative group flex-shrink-0">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted text-muted text-[10px] font-bold cursor-help hover:border-navy hover:text-navy">?</span>
                  <div className="hidden group-hover:block absolute z-50 left-0 top-6 w-[280px] bg-navy text-white text-[11px] leading-relaxed shadow-xl">
                    <div className="px-4 py-2.5 border-b border-cyan/30 text-cyan font-bold tracking-[0.18em] uppercase text-[10px]">점거 규칙</div>
                    <div className="px-4 py-3 space-y-3">
                      <div>
                        <div className="text-cyan font-bold tracking-wider uppercase text-[10px] mb-1">Score 산정</div>
                        <div className="flex justify-between text-[11px]"><span>게시글</span><b>1점</b></div>
                        <div className="flex justify-between text-[11px]"><span>게시글 댓글</span><b>0.7점</b></div>
                        <div className="flex justify-between text-[11px]"><span>아파트글</span><b>1점</b></div>
                        <div className="flex justify-between text-[11px]"><span>아파트 댓글</span><b>0.5점</b></div>
                      </div>
                      <div className="pt-3 border-t border-white/10">
                        <div className="text-cyan font-bold tracking-wider uppercase text-[10px] mb-1">점거</div>
                        <div className="text-[11px]">빈 단지는 누구나 점거 가능</div>
                      </div>
                      <div className="pt-3 border-t border-white/10">
                        <div className="text-cyan font-bold tracking-wider uppercase text-[10px] mb-1">강제집행 (박탈)</div>
                        <div className="text-[11px]">내 score &gt; 점거인 score 일 때만</div>
                        <div className="text-[10px] text-white/60 mt-0.5">동점은 박탈 불가</div>
                      </div>
                      <div className="pt-3 border-t border-white/10">
                        <div className="text-cyan font-bold tracking-wider uppercase text-[10px] mb-1">점거 옮기기</div>
                        <div className="text-[11px]">1인 1점거 — 새 단지 점거 시 기존 단지에서 자동 퇴거</div>
                      </div>
                    </div>
                  </div>
                </span>
                {occupierMlbg !== null && (
                  <span className="text-[11px] text-muted flex-shrink-0">({occupierMlbg.toLocaleString()} mlbg)</span>
                )}
              </div>
              {occupierId === userId ? (
                <span className="text-[11px] font-bold text-cyan flex-shrink-0">내가 점거중</span>
              ) : userId && listingPrice != null ? (
                <button
                  type="button"
                  onClick={buyApt}
                  disabled={trading || (myMlbgBalance != null && myMlbgBalance < listingPrice)}
                  className="text-[11px] font-bold px-2.5 py-1 bg-navy text-white hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  title={myMlbgBalance != null && myMlbgBalance < listingPrice ? `잔액 부족 (${myMlbgBalance} / ${listingPrice} mlbg)` : '매수'}
                >
                  매수 {listingPrice.toLocaleString()} mlbg
                </button>
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
                  <div className="hidden group-hover:block absolute z-50 right-0 top-8 w-[260px] bg-navy text-white text-[11px] leading-relaxed shadow-xl">
                    <div className="px-4 py-2.5 border-b border-cyan/30 text-cyan font-bold tracking-[0.18em] uppercase text-[10px]">강제집행 (박탈)</div>
                    <div className="px-4 py-3 space-y-2">
                      <div>내 score &gt; 점거인 score 일 때만</div>
                      <div className="text-[10px] text-white/60">동점은 박탈 불가</div>
                    </div>
                    <div className="px-4 py-3 border-t border-white/10">
                      <div className="text-cyan font-bold tracking-wider uppercase text-[10px] mb-1">Score 산정</div>
                      <div className="flex justify-between text-[11px]"><span>게시글</span><b>1점</b></div>
                      <div className="flex justify-between text-[11px]"><span>게시글 댓글</span><b>0.7점</b></div>
                      <div className="flex justify-between text-[11px]"><span>아파트글</span><b>1점</b></div>
                      <div className="flex justify-between text-[11px]"><span>아파트 댓글</span><b>0.5점</b></div>
                    </div>
                    <div className="px-4 py-3 border-t border-white/10 space-y-1">
                      {myScore !== null && (
                        <div className="flex justify-between"><span className="text-white/70">내 score</span><b>{myScore}</b></div>
                      )}
                      {occupierScore !== null && (
                        <div className="flex justify-between"><span className="text-white/70">점거인 score</span><b>{occupierScore}</b></div>
                      )}
                      {myScore !== null && occupierScore !== null && myScore <= occupierScore && (
                        <div className="text-[10px] text-cyan mt-1.5">글·댓글로 score 올린 후 다시 시도</div>
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

            {/* 매물 표시 / 매도 컨트롤 */}
            {listingPrice != null && occupierId !== userId && (
              <div className="mt-2 px-3 py-2 bg-cyan/10 border border-cyan/40 text-[12px] flex items-center justify-between">
                <span className="text-navy font-medium">매물 등록됨</span>
                <span className="font-bold text-navy">{listingPrice.toLocaleString()} mlbg</span>
              </div>
            )}
            {occupierId === userId && (
              <div className="mt-2 space-y-1.5">
                {listingPrice != null ? (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-cyan/10 border border-cyan/40 text-[12px]">
                    <span className="text-navy">내 매물 호가</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-navy">{listingPrice.toLocaleString()} mlbg</span>
                      <button type="button" onClick={() => { setSellPriceInput(String(listingPrice)); setSellPanelOpen(true); }}
                        className="text-[11px] text-muted hover:text-navy bg-transparent border-none p-0">수정</button>
                      <button type="button" onClick={unlist} disabled={trading}
                        className="text-[11px] text-red-500 hover:text-red-700 bg-transparent border-none p-0 disabled:opacity-40">해제</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setSellPriceInput(''); setSellPanelOpen((v) => !v); }}
                    className="w-full text-[12px] py-1.5 border border-navy/40 text-navy hover:bg-navy hover:text-white transition-colors">
                    매물로 등록
                  </button>
                )}
                {sellPanelOpen && (
                  <div className="border border-border bg-white p-2.5 flex items-center gap-2">
                    <input type="number" min="1" value={sellPriceInput} onChange={(e) => setSellPriceInput(e.target.value)}
                      placeholder="호가 (mlbg)" className="flex-1 border border-border px-2 py-1 text-[12px] outline-none focus:border-navy" />
                    <button type="button" onClick={listForSale} disabled={trading || !sellPriceInput}
                      className="text-[11px] font-bold px-3 py-1 bg-navy text-white hover:bg-navy-dark disabled:opacity-40">
                      {trading ? '...' : '확정'}
                    </button>
                    <button type="button" onClick={() => setSellPanelOpen(false)}
                      className="text-[11px] text-muted hover:text-text bg-transparent border-none p-0">취소</button>
                  </div>
                )}
              </div>
            )}
          </>
          ) : userId ? (
            <div>
              <div className="text-[12px] text-muted mb-1.5 flex items-center justify-between">
                <span>분양가</span>
                <span className="font-bold text-navy">{getAptListingPrice(apt.lawd_cd).toLocaleString()} mlbg</span>
              </div>
              <button
                type="button"
                onClick={claimApt}
                disabled={claiming}
                className="w-full bg-cyan text-white py-2.5 text-[13px] font-bold tracking-wide hover:bg-cyan-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
                <span>{claiming ? '분양중...' : `이 단지 분양받기 (${getAptListingPrice(apt.lawd_cd)} mlbg)`}</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="block w-full bg-white border border-cyan text-cyan py-2.5 text-[13px] font-bold tracking-wide hover:bg-navy-soft text-center no-underline"
            >
              로그인하고 분양받기
            </Link>
          )}

          {/* 히스토리 토글 */}
          <button
            type="button"
            onClick={toggleHistory}
            className="mt-2 w-full text-[11px] text-muted hover:text-navy py-1 flex items-center justify-center gap-1"
          >
            <span>점거 히스토리</span>
            <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${historyOpen ? 'rotate-180' : ''}`}>
              <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </button>

          {historyOpen && (
            <div className="mt-1 border border-[#f0f0f0] bg-[#fafafa] p-3 max-h-[280px] overflow-y-auto">
              {historyLoading && <div className="text-[11px] text-muted text-center py-4">불러오는 중...</div>}
              {!historyLoading && history && history.length === 0 && (
                <div className="text-[11px] text-muted text-center py-4 leading-relaxed">
                  히스토리 없음.<br />
                  <span className="text-[10px]">SQL 적용 이전 점거 기록은 누락됨</span>
                </div>
              )}
              {!historyLoading && history && history.length > 0 && (
                <ol className="space-y-2">
                  {history.map((h, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-snug">
                      <span className="text-[10px] text-muted tabular-nums flex-shrink-0 mt-0.5 w-[68px]">{fmtHistoryTime(h.occurred_at)}</span>
                      <span className="flex-1 min-w-0">
                        {h.event === 'claim' && (
                          <span><b className="text-cyan">{h.actor_name ?? '익명'}</b> 점거</span>
                        )}
                        {h.event === 'evict' && (
                          <span>
                            <b className="text-muted line-through">{h.prev_occupier_name ?? '익명'}</b>
                            {' → '}
                            <b className="text-cyan">{h.actor_name ?? '익명'}</b>
                            <span className="text-red-500 text-[10px] ml-1">강제집행</span>
                            <div className="text-[10px] text-muted mt-0.5">
                              score {h.prev_score ?? '?'} → {h.actor_score ?? '?'}
                            </div>
                          </span>
                        )}
                        {h.event === 'vacate' && (
                          <span>
                            <b className="text-muted">{h.actor_name ?? '익명'}</b> 이사감
                            <span className="text-muted text-[10px] ml-1">(점거없음)</span>
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
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
              void d.vote_down_count; // 미사용 (down 투표 없음)
              const author = authors.get(d.author_id) ?? { name: d.author_id.slice(0, 6) };
              const myVote = myVotes.get(d.id);
              const isMine = userId === d.author_id;
              const dComments = comments.get(d.id) ?? [];
              const isCommentsOpen = openComments.has(d.id);
              return (
                <li key={d.id} className="border border-navy/30 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,32,96,0.10)] hover:shadow-[0_2px_10px_rgba(0,32,96,0.14)] transition-shadow">
                  <h3 className="text-[15px] text-text leading-snug tracking-tight [&::first-line]:font-extrabold [&::first-line]:text-navy">{d.title}</h3>
                  {d.content && (
                    <p className="text-[14px] text-text mt-1 leading-snug whitespace-pre-wrap [&::first-line]:font-bold">{d.content}</p>
                  )}
                  <div className="text-[11px] text-muted mt-2 flex items-center gap-2">
                    <Nickname info={{ ...author, userId: d.author_id }} className="text-muted" />

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
                  {isCommentsOpen && (() => {
                    const topLevel = dComments.filter((c) => c.parent_id === null);
                    const repliesOf = (parentId: number) => dComments.filter((c) => c.parent_id === parentId);
                    return (
                    <div className="mt-3 pt-3 border-t border-[#f0f0f0] space-y-2">
                      {topLevel.map((c) => {
                        const cAuthor = authors.get(c.author_id) ?? { name: c.author_id.slice(0, 6) };
                        const cIsMine = userId === c.author_id;
                        const replies = repliesOf(c.id);
                        const isReplying = replyTo === c.id;
                        return (
                          <div key={c.id} className="text-[12px]">
                            <p className="text-text whitespace-pre-wrap leading-snug">{c.content}</p>
                            <div className="text-[10px] text-muted mt-0.5 flex items-center gap-1.5">
                              <Nickname info={{ ...cAuthor, userId: c.author_id }} className="text-muted" />
                              <span>·</span>
                              <span>{relativeTime(c.created_at)}</span>
                              {userId && (
                                <>
                                  <span>·</span>
                                  <button type="button" onClick={() => { setReplyTo(isReplying ? null : c.id); setReplyBody(''); }} className="hover:text-navy">
                                    {isReplying ? '취소' : '답글'}
                                  </button>
                                </>
                              )}
                              {cIsMine && (
                                <>
                                  <span>·</span>
                                  <button type="button" onClick={() => deleteComment(c.id)} className="hover:text-red-500">삭제</button>
                                </>
                              )}
                            </div>
                            {/* 대댓글 목록 */}
                            {replies.length > 0 && (
                              <div className="mt-1.5 ml-3 pl-2.5 border-l-2 border-[#e5e5e5] space-y-1.5">
                                {replies.map((r) => {
                                  const rAuthor = authors.get(r.author_id) ?? { name: r.author_id.slice(0, 6) };
                                  const rIsMine = userId === r.author_id;
                                  return (
                                    <div key={r.id} className="text-[12px]">
                                      <p className="text-text whitespace-pre-wrap leading-snug">{r.content}</p>
                                      <div className="text-[10px] text-muted mt-0.5 flex items-center gap-1.5">
                                        <Nickname info={{ ...rAuthor, userId: r.author_id }} className="text-muted" />
                                        <span>·</span>
                                        <span>{relativeTime(r.created_at)}</span>
                                        {rIsMine && (
                                          <>
                                            <span>·</span>
                                            <button type="button" onClick={() => deleteComment(r.id)} className="hover:text-red-500">삭제</button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {/* 답글 입력 폼 */}
                            {isReplying && userId && (
                              <div className="mt-1.5 ml-3 pl-2.5 border-l-2 border-navy/30 flex gap-1.5">
                                <input
                                  type="text"
                                  value={replyBody}
                                  onChange={(e) => setReplyBody(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitReply(d.id, c.id); } }}
                                  placeholder="답글을 입력..."
                                  maxLength={500}
                                  autoFocus
                                  className="flex-1 px-2.5 py-1.5 border border-border bg-white text-[12px] focus:outline-none focus:border-navy"
                                />
                                <button type="button" onClick={() => submitReply(d.id, c.id)}
                                  className="px-3 py-1.5 bg-navy text-white text-[12px] font-bold hover:bg-navy-dark">
                                  등록
                                </button>
                              </div>
                            )}
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
                    );
                  })()}
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
