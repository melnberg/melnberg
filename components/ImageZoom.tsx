'use client';

import { useEffect, useState } from 'react';

// 전역 사진 확대 — 업로드된 사진(Supabase storage 공개 URL)인 <img> 를 클릭하면 큰 화면으로 보여줌.
// 루트 레이아웃에 1개만 마운트. 개별 컴포넌트 수정 없이 어디서든 동작.
// 제외: <a> 안의 썸네일(카드 네비게이션 보존), data-no-zoom 영역(자체 라이트박스 있는 곳).

const STORAGE_MARKER = '/storage/v1/object/public/';

export default function ImageZoom() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName !== 'IMG') return;
      const img = el as HTMLImageElement;
      if (!img.currentSrc && !img.src) return;
      const url = img.currentSrc || img.src;
      if (!url.includes(STORAGE_MARKER)) return;
      if (img.closest('a') || img.closest('[data-no-zoom]')) return;
      e.preventDefault();
      e.stopPropagation();
      setSrc(url);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    if (!src) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSrc(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [src]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[9000] bg-black/85 flex items-center justify-center p-4"
      onClick={() => setSrc(null)}
    >
      <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="max-w-[95vw] max-h-[90vh] object-contain" />
        <button
          type="button"
          onClick={() => setSrc(null)}
          className="absolute -top-1 right-0 -translate-y-full text-white/80 hover:text-white text-[13px] cursor-pointer bg-transparent border-none px-1 py-1"
        >
          닫기 ✕
        </button>
      </div>
    </div>
  );
}
