'use client';

// 본인 프로필 페이지 — "프로필 편집" / "프로필 공유" 가로 50/50 버튼.
// 공유 = navigator.clipboard 로 현재 URL 복사. 실패 시 alert fallback.

import Link from 'next/link';
import { useState } from 'react';

type Props = {
  /** 공유할 URL — 비우면 window.location.href */
  shareUrl?: string;
  /** 편집 버튼 링크 (기본: /threads/profile) */
  editHref?: string;
};

export default function ThreadProfileActions({ shareUrl, editHref = '/threads/profile' }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = shareUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // legacy fallback
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      alert(url);
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 pb-4">
      <Link
        href={editHref}
        className="flex-1 border border-gray-300 rounded-lg py-2.5 text-[14px] font-bold text-black no-underline text-center hover:bg-gray-50 transition-colors"
      >
        프로필 편집
      </Link>
      <button
        type="button"
        onClick={handleShare}
        className="flex-1 border border-gray-300 rounded-lg py-2.5 text-[14px] font-bold text-black hover:bg-gray-50 transition-colors"
      >
        {copied ? '복사됨' : '프로필 공유'}
      </button>
    </div>
  );
}
