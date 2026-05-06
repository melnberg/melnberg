// 브라우저에서 이미지 파일 → WEBP 로 변환.
// 용량 절감 목적. canvas → toBlob('image/webp', quality).
// 가로 maxWidth 초과 시 비율 유지 축소.

export async function fileToWebp(
  file: File,
  opts: { quality?: number; maxWidth?: number } = {},
): Promise<{ blob: Blob; name: string; type: 'image/webp' }> {
  const quality = opts.quality ?? 0.82;
  const maxWidth = opts.maxWidth ?? 1920;

  // GIF 는 애니메이션 손실 우려 → 그대로 통과
  if (file.type === 'image/gif') {
    return { blob: file, name: file.name, type: 'image/webp' as const };
  }

  // 이미 webp + 충분히 작으면 변환 생략
  if (file.type === 'image/webp' && file.size < 200_000) {
    return { blob: file, name: file.name, type: 'image/webp' as const };
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // createImageBitmap 실패 시 원본 반환 (서버에서 처리)
    return { blob: file, name: file.name, type: 'image/webp' as const };
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
    return { blob: file, name: file.name, type: 'image/webp' as const };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/webp',
      quality,
    );
  });

  // 원본보다 큰 경우 (드물지만) 원본 사용
  if (blob.size > file.size && file.type !== 'image/png') {
    return { blob: file, name: file.name, type: 'image/webp' as const };
  }

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return { blob, name: `${baseName}.webp`, type: 'image/webp' as const };
}
