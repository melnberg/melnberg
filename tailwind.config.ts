import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy:      '#002060',
        'navy-dark': '#0070C0',
        cyan:      '#00B0F0',
        'navy-soft': 'rgba(0, 32, 96, 0.06)',
        text:      '#111111',
        muted:     '#777777',
        border:    '#E5E7EB',
        bg:        '#F5F5F0',
        kakao:     '#FEE500',
        'kakao-text': '#191919',
        naver:     '#03C75A',
        // 일기장 톤 (나의 일깃장 영역 전용 — PPT 3색과 분리)
        'diary-bg':     '#fdf6e3',  // 페이지 배경 — 따뜻한 크림
        'diary-paper':  '#fff8ec',  // 카드 / 작성 폼 종이
        'diary-border': '#e8d9b8',  // 부드러운 베이지 테두리
        'diary-border-strong': '#d4c5a8',
        'diary-ink':    '#5c4634',  // 따뜻한 갈색 — 본문
        'diary-ink-soft': '#8a6f55', // 메타 / 부가
        'diary-accent': '#c89b6f',  // 황토 액센트
        'diary-accent-deep': '#a07f5f', // 카멜
      },
      fontFamily: {
        sans: [
          "'Pretendard Variable'", 'Pretendard',
          '-apple-system', 'BlinkMacSystemFont',
          "'Apple SD Gothic Neo'", "'Noto Sans KR'", "'Malgun Gothic'",
          'sans-serif',
        ],
      },
      maxWidth: {
        content: '920px',
      },
    },
  },
  plugins: [],
};

export default config;
