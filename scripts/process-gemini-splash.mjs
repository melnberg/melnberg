// Gemini 가 만든 splash 에서 우측 하단 ✦ 워터마크 제거
// 우측 하단 ~16% 영역을 네이비로 덮음 → 2732 캔버스 가운데 배치
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'assets', 'Gemini_Generated_Image_toidh2toidh2toid.png');
const out = path.join(root, 'assets');

const NAVY = { r: 0x00, g: 0x20, b: 0x60, alpha: 1 };
const NAVY_HEX = '#002060';

const meta = await sharp(src).metadata();
console.log(`원본: ${meta.width}x${meta.height}`);

// 우측 하단 ~16% 정사각형 영역에 네이비 패치 — ✦ 워터마크 가림
// (워터마크는 보통 모서리 쪽에 작게 박혀있음)
const patchW = Math.round(meta.width * 0.16);
const patchH = Math.round(meta.height * 0.16);
const patch = await sharp({
  create: { width: patchW, height: patchH, channels: 4, background: NAVY },
}).png().toBuffer();

const cleaned = await sharp(src)
  .composite([{
    input: patch,
    left: meta.width - patchW,
    top: meta.height - patchH,
  }])
  .png()
  .toBuffer();

// 2732x2732 네이비 캔버스 가운데에 배치 — Capacitor 기준 사이즈
const FINAL = 2732;
// 원본을 2050px 정도로 키워서 가운데 (약 75%)
const inner = Math.round(FINAL * 0.75);
const innerBuf = await sharp(cleaned)
  .resize(inner, inner, { kernel: 'lanczos3' })
  .png()
  .toBuffer();

const splash = await sharp({
  create: { width: FINAL, height: FINAL, channels: 4, background: NAVY },
})
  .composite([{ input: innerBuf, gravity: 'center' }])
  .png()
  .toBuffer();

await sharp(splash).toFile(path.join(out, 'splash.png'));
await sharp(splash).toFile(path.join(out, 'splash-dark.png'));

console.log('✓ assets/splash.png (2732x2732, 워터마크 제거 + 가운데 배치)');
console.log('✓ assets/splash-dark.png');
