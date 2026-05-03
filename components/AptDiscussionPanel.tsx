'use client';

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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDiscussions(null);
    setLoading(true);
    setErr(null);

    const supabase = createClient();
    // 작가 표시명은 profiles 별도 fetch (apt_discussions.author_id FK가 auth.users라 join 안 됨)
    supabase
      .from('apt_discussions')
      .select('id, title, content, vote_up_count, vote_down_count, created_at, author_id')
      .eq('apt_master_id', apt.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setErr(error.message); setLoading(false); return; }
        setDiscussions((data ?? []) as unknown as Discussion[]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [apt.id]);

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

        {!loading && !err && discussions && discussions.length === 0 && (
          <div className="px-6 py-12 text-sm text-muted leading-relaxed">
            아직 이 단지에 대한 글이 없어요.<br />첫 글로 평가·후기를 남겨보세요.
          </div>
        )}

        {!loading && !err && discussions && discussions.length > 0 && (
          <ul className="divide-y divide-[#f0f0f0]">
            {discussions.map((d) => {
              const score = d.vote_up_count - d.vote_down_count;
              const author = d.author_id.slice(0, 6);
              return (
                <li key={d.id} className="px-6 py-4 hover:bg-[#fafafa] cursor-pointer transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[14px] font-bold text-navy leading-snug flex-1 line-clamp-2">{d.title}</h3>
                    <div className="flex-shrink-0 text-right">
                      <div className={`text-[13px] font-bold ${score > 0 ? 'text-cyan' : score < 0 ? 'text-red-500' : 'text-muted'}`}>
                        {score > 0 ? '+' : ''}{score}
                      </div>
                    </div>
                  </div>
                  <p className="text-[12px] text-text mt-1.5 line-clamp-2 leading-relaxed">{d.content}</p>
                  <div className="text-[11px] text-muted mt-2 flex items-center gap-2">
                    <span>{author}</span>
                    <span>·</span>
                    <span>{relativeTime(d.created_at)}</span>
                    <span>·</span>
                    <span>↑ {d.vote_up_count} / ↓ {d.vote_down_count}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border px-6 py-4">
        <button
          type="button"
          className="w-full bg-navy text-white py-3 px-4 text-sm font-bold tracking-wide hover:bg-navy-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled
          title="다음 단계에서 활성화"
        >
          글쓰기 (준비중)
        </button>
      </div>
    </aside>
  );
}
