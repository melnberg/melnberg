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
  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === 'string') return <React.Fragment key={i}>{p}</React.Fragment>;
        if (p.isImage) {
          // 이미지 — block 으로 자체 줄. max width 로 모바일 안전.
          // onClick 제거 — Server Component 에서 렌더 시 함수 prop 직렬화 이슈 방지.
          return (
            <img
              key={i}
              src={p.href}
              alt=""
              loading="lazy"
              className="block max-w-full h-auto my-3 border border-border"
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
