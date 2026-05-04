import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

// 점거/강제집행 액션 후 호출 — 서버측 unstable_cache 무효화.
// 클라이언트 GET /api/home-pins 시 fresh 데이터 반환되도록.
export async function POST() {
  revalidateTag('apt-master');
  return NextResponse.json({ ok: true });
}
