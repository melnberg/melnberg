'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';

type Notification = {
  id: number;
  type: 'community_comment' | 'apt_comment' | 'apt_evicted' | 'feedback_reply' | 'admin_notice' | 'bio_comment';
  post_id: number | null;
  apt_discussion_id: number | null;
  apt_master_id: number | null;
  apt_name: string | null;
  comment_excerpt: string | null;
  actor_name: string | null;
  created_at: string;
  read_at: string | null;
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

export default function NotificationsBell() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // 안 읽은 카운트만 주기적으로 가져옴 (30s)
  useEffect(() => {
    let cancelled = false;
    async function refreshCount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setSignedIn(!!user);
      setCurrentUserId(user?.id ?? null);
      if (!user) { setUnread(0); return; }
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (!cancelled) setUnread(count ?? 0);
    }
    refreshCount();
    const id = setInterval(refreshCount, 30000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부 클릭 시 닫기 — wrap (버튼) 또는 panel 안 클릭은 보존
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const inWrap = wrapRef.current?.contains(e.target as Node);
      const inPanel = panelRef.current?.contains(e.target as Node);
      if (!inWrap && !inPanel) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // 패널 위치 — 버튼 아래 + 좌측 정렬, 화면 밖 넘치면 우측 정렬
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    function recalc() {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      const PANEL_W = 380;
      const margin = 12;
      let left = r.left;
      if (left + PANEL_W > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - PANEL_W - margin);
      }
      setPanelPos({ top: r.bottom + 8, left });
    }
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => {
      window.removeEventListener('resize', recalc);
      window.removeEventListener('scroll', recalc, true);
    };
  }, [open]);

  async function loadList() {
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notification[]);
    setLoading(false);
  }

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (items === null) await loadList();
    // 패널 열면 모두 read 처리 (안 읽은 뱃지 0으로)
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    setUnread(0);
  }

  function hrefFor(n: Notification, currentUserId: string | null = null): string {
    if (n.type === 'community_comment' && n.post_id) return `/community/${n.post_id}`;
    if (n.type === 'feedback_reply') return '/me/feedback';
    if (n.type === 'admin_notice') return '/me';
    if (n.type === 'bio_comment' && currentUserId) return `/u/${currentUserId}?tab=bio`;
    if ((n.type === 'apt_comment' || n.type === 'apt_evicted') && n.apt_master_id) {
      return `/?apt=${n.apt_master_id}`;
    }
    return '/';
  }

  if (!signedIn) return null;

  const panel = open && panelPos && mounted ? createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: panelPos.top, left: panelPos.left, width: 380, maxWidth: 'calc(100vw - 24px)', maxHeight: '70vh', zIndex: 100 }}
      className="bg-white border border-border shadow-[0_8px_32px_rgba(0,0,0,0.15)] flex flex-col"
    >
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-border">
        <h3 className="text-[15px] font-bold text-navy">알림센터</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-navy text-[18px] leading-none">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="px-5 py-12 text-center text-[12px] text-muted">불러오는 중...</div>}
        {!loading && items && items.length === 0 && (
          <div className="px-5 py-12 text-center text-[12px] text-muted leading-relaxed">
            아직 알림이 없어요.<br />내 글에 댓글이 달리면 여기 표시됩니다.
          </div>
        )}
        {!loading && items && items.length > 0 && (
          <ul>
            {items.map((n) => {
              const cat =
                n.type === 'community_comment' ? '커뮤니티' :
                n.type === 'apt_comment' ? '아파트' :
                n.type === 'apt_evicted' ? '강제집행' :
                n.type === 'admin_notice' ? '관리자 알림' :
                n.type === 'bio_comment' ? '자기소개 댓글' :
                '건의 답글';
              return (
                <li key={n.id} className={`border-b border-[#f0f0f0] last:border-b-0 ${n.read_at ? 'bg-white' : 'bg-[#f5f9ff]'}`}>
                  <Link
                    href={hrefFor(n, currentUserId)}
                    onClick={() => setOpen(false)}
                    className="block px-5 py-3 hover:bg-[#eef4fb] no-underline"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] font-bold text-navy">{n.actor_name ?? '익명'}</span>
                      <span className="text-[10px] text-muted">·</span>
                      <span className="text-[10px] text-muted">{cat}</span>
                      <span className="text-[10px] text-muted">·</span>
                      <span className="text-[10px] text-muted">{relTime(n.created_at)}</span>
                      {!n.read_at && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500" />}
                    </div>
                    <div className="text-[12px] text-text leading-snug line-clamp-2">
                      {n.type === 'apt_evicted' ? (
                        <span><span className="font-bold text-navy">{n.apt_name ?? '아파트'}</span> 에서 강제집행 되었습니다.</span>
                      ) : n.type === 'feedback_reply' ? (
                        <>건의사항 답글: <span className="text-muted">{n.comment_excerpt ?? ''}</span></>
                      ) : n.type === 'admin_notice' ? (
                        <span className="text-text">{n.comment_excerpt ?? '관리자 알림'}</span>
                      ) : n.type === 'bio_comment' ? (
                        <>내 자기소개 댓글: <span className="text-muted">{n.comment_excerpt ?? ''}</span></>
                      ) : (
                        <>댓글: <span className="text-muted">{n.comment_excerpt ?? '(내용 없음)'}</span></>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={wrapRef} className="relative inline-flex flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={`알림 ${unread}건`}
        className="relative w-6 h-6 flex items-center justify-center text-muted hover:text-navy"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
