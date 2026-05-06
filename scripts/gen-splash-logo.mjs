// 스플래시용 로고 — 검정 배경 + 흰 "melnberg" (Pretendard 폰트)
// Pretendard woff2 를 base64 embed 해서 시스템 폰트 설치 없이도 정확한 폰트로 렌더
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dst = path.join(root, 'android', 'app', 'src', 'main', 'res', 'drawable', 'splash_logo.png');

// Pretendard Bold woff2 다운로드 + base64
const FONT_URL = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/woff2/Pretendard-Bold.woff2';
const fontResp = await fetch(FONT_URL);
if (!fontResp.ok) throw new Error(`Pretendard download failed: ${fontResp.status}`);
const fontBuf = Buffer.from(await fontResp.arrayBuffer());
const fontB64 = fontBuf.toString('base64');
console.log(`✓ Pretendard Bold 다운로드 (${(fontBuf.length / 1024).toFixed(0)}KB)`);

const svg = `
<svg width="2048" height="2048" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'Pretendard';
        font-weight: 700;
        src: url(data:font/woff2;base64,${fontB64}) format('woff2');
      }
      .t { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Segoe UI', Arial, sans-serif; font-weight: 700; fill: #fff; letter-spacing: -0.025em; }
    </style>
  </defs>
  <text x="1024" y="1130" text-anchor="middle" class="t" font-size="280">melnberg</text>
</svg>
`;

await sharp(Buffer.from(svg))
  .resize(1080, 1080, { kernel: 'lanczos3' })
  .png()
  .toFile(dst);
console.log('✓ android/app/src/main/res/drawable/splash_logo.png (Pretendard Bold)');
