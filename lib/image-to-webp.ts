// 브라우저에서 이미지 파일 → WEBP 또는 JPEG 로 변환.
// 1순위: WebP (canvas.toBlob('image/webp')) → 2순위: JPEG 재인코딩 (Safari fallback)
// 가로 maxWidth 초과 시 비율 유지 축소.

type ConvertResult = { blob: Blob; name: string; type: 'image/webp' | 'image/jpeg' };

export async function fileToWebp(
  file: File,
  opts: { quality?: number; maxWidth?: number } = {},
): Promise<ConvertResult> {
  const quality = opts.quality ?? 0.82;
  const maxWidth = opts.maxWidth ?? 1920;

  // GIF 는 애니메이션 손실 우려 → 그대로 통과
  if (file.type === 'image/gif') {
    return { blob: file, name: file.name, type: 'image/webp' };
  }

  // 이미 webp + 충분히 작으면 변환 생략
  if (file.type === 'image/webp' && file.size < 200_000) {
    return { blob: file, name: file.name, type: 'image/webp' };
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    return { blob: file, name: file.name, type: 'image/webp' };
  }

  let { width, height } = bitmap;
  if (width > maxWidth) {
    const ratio = maxWidth / width;
    width = maxWidth;
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { blob: file, name: file.name, type: 'image/webp' };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  // toBlob 헬퍼 — 실패 시 null
  const toBlob = (mime: string, q: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, q));

  // 1순위 WebP 시도
  let blob = await toBlob('image/webp', quality);
  let outType: 'image/webp' | 'image/jpeg' = 'image/webp';
  let outExt = 'webp';

  // WebP 실패 시 (Safari 일부 버전 등) JPEG 재인코딩 fallback
  if (!blob) {
    blob = await toBlob('image/jpeg', 0.85);
    outType = 'image/jpeg';
    outExt = 'jpg';
  }

  // 둘 다 실패 — 원본 반환
  if (!blob) {
    return { blob: file, name: file.name, type: 'image/webp' };
  }

  // 변환 결과가 원본보다 크면 (PNG 제외하고는 거의 없지만) 원본 사용
  if (blob.size > file.size && file.type !== 'image/png') {
    return { blob: file, name: file.name, type: 'image/webp' };
  }

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return { blob, name: `${baseName}.${outExt}`, type: outType };
}
