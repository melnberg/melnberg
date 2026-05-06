// 글·댓글 본문의 URL 을 클릭 가능한 <a> 로 변환.
// 이미지 확장자(.jpg/.jpeg/.png/.gif/.webp) URL 은 <img> 로 렌더 → PostForm 의 사진 업로드 결과가 자동 인라인.
import React from 'react';

const URL_RE = /(https?:\/\/[^\s<>'"()]+|www\.[^\s<>'"()]+)/gi;
const IMG_EXT_RE = /\.(jpe?g|png|gif|webp)(\?[^]*)?$/i;

function isImageUrl(url: string): boolean {
  // querystring 제거 후 확장자 검사
  const noQuery = url.split('?')[0].split('#')[0];
  return IMG_EXT_RE.test(noQuery);
}

export function linkify(text: string | null | undefined): React.ReactNode {
  if (!text) return text ?? null;
  const parts: Array<string | { url: string; href: string; isImage: boolean }> = [];
  try {
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
      const idx = m.index ?? 0;
      if (idx > last) parts.push(text.slice(last, idx));
      const raw = m[0];
      const trailMatch = raw.match(/[.,!?:;]+$/);
      const url = trailMatch ? raw.slice(0, raw.length - trailMatch[0].length) : raw;
      const trail = trailMatch ? trailMatch[0] : '';
      const href = url.startsWith('http') ? url : `https://${url}`;
      parts.push({ url, href, isImage: isImageUrl(url) });
      if (trail) parts.push(trail);
      last = idx + raw.length;
    }
    if (last < text.length) parts.push(text.slice(last));
  } catch (e) {
    // 정규식·문자열 처리 실패 시 원문 그대로 반환 (server render 안 깨짐 보장)
    console.error('[linkify] parse error:', e);
    return text;
  }
  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === 'string') return <React.Fragment key={i}>{p}</React.Fragment>;
        if (p.isImage) {
          // 이미지 — SNS 스타일. 인라인 style 로 강제 적용 (Tailwind JIT arbitrary class 안 먹는 사고 방지).
          // 세로 사진이 화면 절반 차지하던 사고 (2026-05-06) 해결.
          return (
            <img
              key={i}
              src={p.href}
              alt=""
              loading="lazy"
              style={{ maxWidth: '480px', maxHeight: '400px', width: 'auto', height: 'auto', objectFit: 'contain' }}
              className="block my-3 mx-auto border border-border rounded-xl"
            />
          );
        }
        return (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan underline hover:text-navy break-all"
          >
            {p.url}
          </a>
        );
      })}
    </>
  );
}
