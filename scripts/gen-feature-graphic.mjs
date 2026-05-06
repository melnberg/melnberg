// Play Store 기능 그래픽 — 1024x500 배너
// 멜른버그 다크 네이비 배경 + 좌측 로고 + 우측 카피
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logoSrc = path.join(root, 'public', 'icon-512.png');
const out = path.join(root, 'assets', 'feature-graphic.png');

const W = 1024, H = 500;
const NAVY = { r: 0x00, g: 0x20, b: 0x60, alpha: 1 };

// 로고 — 좌측 가운데, 약 360px
const logoSize = 360;
const logoBuf = await sharp(logoSrc).resize(logoSize, logoSize, { kernel: 'lanczos3' }).png().toBuffer();

// 우측 카피 (SVG 로 텍스트 렌더 → sharp 가 PNG 로 변환)
const textSvg = `
<svg width="${W - logoSize - 80}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .h { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-weight: 800; fill: #fff; letter-spacing: -0.02em; }
    .s { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-weight: 500; fill: #00B0F0; letter-spacing: -0.01em; }
  </style>
  <text x="0" y="180" class="h" font-size="72">데이터로 본다,</text>
  <text x="0" y="270" class="h" font-size="72">아파트의 진짜.</text>
  <text x="0" y="350" class="s" font-size="32">실거래·시세·커뮤니티 한 앱에서.</text>
</svg>`;
const textBuf = Buffer.from(textSvg);

// 합성
await sharp({
  create: { width: W, height: H, channels: 4, background: NAVY },
})
  .composite([
    { input: logoBuf, left: 60, top: Math.round((H - logoSize) / 2) },
    { input: textBuf, left: logoSize + 80, top: 0 },
  ])
  .png()
  .toFile(out);

console.log(`✓ ${out} (${W}x${H})`);
