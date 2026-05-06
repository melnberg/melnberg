// 안드로이드 앱 아이콘 + 스플래시 원본 생성
// public/icon-512.png 을 베이스로:
//   assets/icon.png             — 1024x1024 legacy 아이콘 (구형 폰용)
//   assets/icon-foreground.png  — 1024x1024 어댑티브 전경 (로고만, 안전영역 안에 ~66%)
//   assets/icon-background.png  — 1024x1024 솔리드 네이비 (전체 채움)
//   assets/splash.png           — 2732x2732, 네이비 배경 + 가운데 로고
//   assets/splash-dark.png      — 동일
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'public', 'icon-512.png');
const out = path.join(root, 'assets');
await mkdir(out, { recursive: true });

const NAVY = { r: 0x00, g: 0x20, b: 0x60, alpha: 1 };

// legacy 아이콘 — 그대로 1024 로 확대
await sharp(src).resize(1024, 1024, { kernel: 'lanczos3' }).png().toFile(path.join(out, 'icon.png'));

// 어댑티브 배경 — 솔리드 네이비
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: NAVY } })
  .png()
  .toFile(path.join(out, 'icon-background.png'));

// 어댑티브 전경 — 1024 캔버스 거의 꽉 차게 (95%) 배치 → 로고가 크게 보임
// (원본의 네이비 원이 안전영역 살짝 넘치지만 어차피 배경도 네이비라 시각적으로 동일,
//  로고 텍스트만 더 크게 보이는 효과)
const fgInnerSize = Math.round(1024 * 0.95); // 약 973px
const fgBuf = await sharp(src).resize(fgInnerSize, fgInnerSize, { kernel: 'lanczos3' }).png().toBuffer();
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: fgBuf, gravity: 'center' }])
  .png()
  .toFile(path.join(out, 'icon-foreground.png'));

// 스플래시 — 2732 사각형 네이비 배경, 가운데 로고
const splashLogoBuf = await sharp(src).resize(1024, 1024, { kernel: 'lanczos3' }).png().toBuffer();
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: NAVY },
})
  .composite([{ input: splashLogoBuf, gravity: 'center' }])
  .png()
  .toBuffer();

await sharp(splash).toFile(path.join(out, 'splash.png'));
await sharp(splash).toFile(path.join(out, 'splash-dark.png'));

console.log('✓ assets/icon.png (1024x1024 legacy)');
console.log('✓ assets/icon-background.png (1024x1024 solid navy)');
console.log('✓ assets/icon-foreground.png (1024x1024 logo centered ~66%)');
console.log('✓ assets/splash.png (2732x2732)');
console.log('✓ assets/splash-dark.png (2732x2732)');
