import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

// 홈 피드 (`/`) 캐시 무효화. 클라이언트 mutation 직후 fire-and-forget 호출.
// 인증/권한 체크 없음 — 단순 cache bust 라 안전. (실제 데이터 mutation 은 별도 RLS 통과 필수)
export async function POST() {
  revalidateTag('home-feed');
  return NextResponse.json({ ok: true });
}
