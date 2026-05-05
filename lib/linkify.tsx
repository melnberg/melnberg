// 글·댓글 본문의 URL 을 클릭 가능한 <a> 로 변환.
// http(s)://...  /  www....  / 한글 도메인은 별도 처리 안 함 (한국 카페 글 대다수는 라틴 URL)
import React from 'react';

const URL_RE = /(https?:\/\/[^\s<>'"()]+|www\.[^\s<>'"()]+)/gi;

export function linkify(text: string | null | undefined): React.ReactNode {
  if (!text) return text ?? null;
  const parts: Array<string | { url: string; href: string }> = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));
    const raw = m[0];
    // trailing punctuation stripping (., ,, !, ?, :, ;)
    const trailMatch = raw.match(/[.,!?:;]+$/);
    const url = trailMatch ? raw.slice(0, raw.length - trailMatch[0].length) : raw;
    const trail = trailMatch ? trailMatch[0] : '';
    const href = url.startsWith('http') ? url : `https://${url}`;
    parts.push({ url, href });
    if (trail) parts.push(trail);
    last = idx + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <>
      {parts.map((p, i) => typeof p === 'string'
        ? <React.Fragment key={i}>{p}</React.Fragment>
        : (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan underline hover:text-navy break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {p.url}
          </a>
        ))}
    </>
  );
}
