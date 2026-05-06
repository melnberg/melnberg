// 1회성 — 맛집 추천 기능 오픈 텔레그램 발송
// CRON_SECRET 또는 ?secret=... 로 호출 가능. 한 번 발송하면 끝.
// 사용: curl https://melnberg.vercel.app/api/cron/send-restaurant-launch?secret=...

import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

const TEXT = `🍴 <b>맛집 추천 기능 오픈</b>

본인이 아는 맛집을 직접 등록할 수 있어요.

· 등록 시 <b>+30 mlbg</b> 즉시 지급
· 1인 최대 5개
· 가게명 / 설명 / 추천메뉴 + 사진 (선택)
· 누구나 분양받기 가능 (100 mlbg, 일 수익 1)
· 좋아요 / 댓글 시 등록자에게 종 알림

좌측 사이드바 "🍴 맛집 추천" → "+ 맛집 등록"
👉 <a href="https://melnberg.vercel.app/restaurants/new">바로 등록하기</a>`;

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const secretQ = req.nextUrl.searchParams.get('secret');
  const ok = (process.env.CRON_SECRET && (auth === `Bearer ${process.env.CRON_SECRET}` || secretQ === process.env.CRON_SECRET));
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const r = await sendTelegramMessage(TEXT, { parseMode: 'HTML' });
  return NextResponse.json(r);
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
