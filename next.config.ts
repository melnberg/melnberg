import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 옛 .html URL 호환 — 검색엔진 색인된 링크 보존
  async redirects() {
    return [
      { source: '/index.html',  destination: '/',          permanent: true },
      { source: '/blog.html',   destination: '/blog',      permanent: true },
      { source: '/terms.html',  destination: '/terms',     permanent: true },
      { source: '/privacy.html', destination: '/privacy',   permanent: true },
      { source: '/짧은상담.html', destination: '/짧은상담',   permanent: true },
      { source: '/중간상담.html', destination: '/중간상담',   permanent: true },
      { source: '/신규가입.html', destination: '/신규가입',   permanent: true },
      { source: '/갱신.html',     destination: '/갱신',       permanent: true },
    ];
  },
};

export default nextConfig;
