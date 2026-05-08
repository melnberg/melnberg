// 포춘쿠키 OG 이미지 — 카카오톡 공유 시 미리보기로 띄울 정사각/landscape 이미지.
// 1200x630 PNG. 운세 본문 + 작성자 + 날짜 + 쿠키 모티브.

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
    .select('id, user_id, fortune_text, drawn_date')
    .eq('id', fortuneId)
    .is('deleted_at', null)
    .maybeSingle();
  const fortune = row as { user_id: string; fortune_text: string; drawn_date: string } | null;
  let authorName = '회원';
  if (fortune) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', fortune.user_id)
      .maybeSingle();
    const dn = (prof as { display_name?: string | null } | null)?.display_name;
    if (dn) authorName = dn;
  }
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
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #fef3c7 100%)',
          padding: '80px',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, color: '#047857', letterSpacing: '0.2em', marginBottom: 16 }}>
          {dateLabel} 포춘쿠키
        </div>
        <div style={{ fontSize: 120, marginBottom: 24 }}>🥠</div>
        <div
          style={{
            fontSize: 44,
            color: '#1f2937',
            lineHeight: 1.5,
            textAlign: 'center',
            maxWidth: 1000,
            fontWeight: 600,
            wordBreak: 'keep-all',
          }}
        >
          {text}
        </div>
        <div style={{ marginTop: 40, fontSize: 22, color: '#6b7280', fontWeight: 600 }}>
          — {authorName}의 운세 · 멜른버그
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
