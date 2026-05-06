// 어댑티브 아이콘 전경 — SVG 텍스트 → 2048 렌더 → 1024 다운샘플
// 고화질 안티에일리어싱 위해 2배 해상도로 렌더 후 lanczos3 로 줄임
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets');

const NAVY = { r: 0x00, g: 0x20, b: 0x60, alpha: 1 };

// 전경 SVG — 2048x2048 (2배), 가운데에 mlbg + seoul (초록점 제거)
// 문자 사이즈는 1024 기준 350 → 2배 = 700
const fgSvg = `
<svg width="2048" height="2048" xmlns="http://www.w3.org/2000/svg">
  <style>
    .lg { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Segoe UI', Arial, sans-serif; font-weight: 900; fill: #fff; letter-spacing: -0.04em; }
    .sm { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Segoe UI', Arial, sans-serif; font-weight: 600; fill: #fff; letter-spacing: -0.02em; }
  </style>
  <text x="1024" y="1080" text-anchor="middle" class="lg" font-size="700">mlbg</text>
  <text x="1024" y="1430" text-anchor="middle" class="sm" font-size="280">seoul</text>
</svg>
`;

// 전경 PNG — 2048 SVG → 1024 PNG (다운샘플로 안티에일리어싱)
await sharp(Buffer.from(fgSvg))
  .resize(1024, 1024, { kernel: 'lanczos3' })
  .png()
  .toFile(path.join(out, 'icon-foreground.png'));
console.log('✓ assets/icon-foreground.png (고해상도 다운샘플)');

// 배경 — 단색 네이비
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: NAVY } })
  .png()
  .toFile(path.join(out, 'icon-background.png'));
console.log('✓ assets/icon-background.png');

// legacy 아이콘 — 전경 + 배경 합성, 동일하게 2048 → 1024 다운샘플
const legacy2048 = await sharp({
  create: { width: 2048, height: 2048, channels: 4, background: NAVY },
})
  .composite([{ input: Buffer.from(fgSvg) }])
  .png()
  .toBuffer();
await sharp(legacy2048)
  .resize(1024, 1024, { kernel: 'lanczos3' })
  .png()
  .toFile(path.join(out, 'icon.png'));
console.log('✓ assets/icon.png (legacy, 다운샘플)');
