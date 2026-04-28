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
