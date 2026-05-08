// 포춘쿠키 OG 이미지 — 카카오톡 공유 시 미리보기로 띄울 정사각형(1:1) 이미지.
// 모달 디자인 그대로 — 흰 카드 + 에메랄드 테두리 + 🥠 + 운세 본문.

import { ImageResponse } from 'next/og';
import { createPublicClient } from '@/lib/supabase/public';

export const runtime = 'edge';

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;
  const fortuneId = Number(id);
  if (!Number.isFinite(fortuneId) || fortuneId <= 0) {
    return new Response('bad id', { status: 400 });
  }

  const supabase = createPublicClient();
  const { data: row } = await supabase
    .from('fortune_cookies')
    .select('id, fortune_text, drawn_date')
    .eq('id', fortuneId)
    .is('deleted_at', null)
    .maybeSingle();
  const fortune = row as { fortune_text: string; drawn_date: string } | null;
  const text = fortune?.fortune_text ?? '오늘의 운세';
  const drawn = fortune?.drawn_date ? new Date(fortune.drawn_date) : new Date();
  const dateLabel = `${drawn.getMonth() + 1}월 ${drawn.getDate()}일`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f3f4f6',
          padding: '60px',
        }}
      >
        {/* 모달 카드 — 흰 배경 + 에메랄드 테두리 4px (실제 모달과 동일) */}
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            border: '8px solid #34d399',
            boxShadow: '0 16px 60px rgba(16,185,129,0.35)',
            padding: '60px',
          }}
        >
          {/* 5월 9일 포춘쿠키 — 상단 작은 라벨 */}
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: '#059669',
              letterSpacing: '0.25em',
              marginBottom: 28,
            }}
          >
            {dateLabel} 포춘쿠키
          </div>

          {/* 🥠 큰 이모지 */}
          <div style={{ fontSize: 220, marginBottom: 36, lineHeight: 1 }}>🥠</div>

          {/* 운세 본문 */}
          <div
            style={{
              fontSize: 44,
              color: '#1f2937',
              lineHeight: 1.55,
              textAlign: 'center',
              fontWeight: 600,
              wordBreak: 'keep-all',
              maxWidth: 600,
            }}
          >
            {text}
          </div>

          {/* 하단 — 멜른버그 푸터 */}
          <div
            style={{
              marginTop: 48,
              fontSize: 22,
              color: '#9ca3af',
              fontWeight: 600,
              letterSpacing: '0.1em',
            }}
          >
            🍪 멜른버그
          </div>
        </div>
      </div>
    ),
    { width: 800, height: 800 },
  );
}
