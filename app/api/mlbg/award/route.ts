import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

type Kind = 'apt_post' | 'apt_comment' | 'community_post' | 'community_comment';

const BASE: Record<Kind, number> = {
  apt_post: 1.0,
  apt_comment: 0.5,
  community_post: 2.0,
  community_comment: 0.3,
};

const KIND_LABEL: Record<Kind, string> = {
  apt_post: '아파트 단지 평가 글',
  apt_comment: '아파트 단지 평가 댓글',
  community_post: '커뮤니티 게시판 글',
  community_comment: '커뮤니티 게시판 댓글',
};

// AI 평가 — multiplier 0.1 ~ 1.5 범위로 반환
async function evaluateQuality(kind: Kind, content: string): Promise<{ multiplier: number; reason: string }> {
  const text = (content ?? '').trim();
  if (!text) return { multiplier: 0.1, reason: '내용 없음' };

  const oa = getOpenAI();
  const sys = `너는 부동산 커뮤니티 글의 정보가치를 평가하는 심사위원이야.
판정 결과는 반드시 JSON 으로만 답해: {"score": <0.1~1.5 사이 숫자>, "reason": "<짧은 한 줄 사유>"}

가이드:
- 0.1 ~ 0.3: 의미없음/스팸/한두 단어/이모지/광고/욕설
- 0.4 ~ 0.7: 단순 의견·짧은 감상 ("좋네요", "별로")
- 0.8 ~ 1.0: 일반적인 의견·정보가 어느 정도 있음
- 1.1 ~ 1.3: 구체적 정보·경험 공유
- 1.4 ~ 1.5: 정성있는 분석·정보가 풍부

길이만 길고 내용 빈약하면 점수 낮춤. 짧아도 정보가치 높으면 점수 높임.`;

  const user = `${KIND_LABEL[kind]}을 평가해.

내용:
"""
${text.slice(0, 2000)}
"""`;

  try {
    const res = await oa.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    });
    const raw = res.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as { score?: number; reason?: string };
    let m = Number(parsed.score);
    if (!Number.isFinite(m)) m = 1.0;
    m = Math.max(0.1, Math.min(1.5, m));
    return { multiplier: Math.round(m * 10) / 10, reason: (parsed.reason ?? '').slice(0, 120) };
  } catch (err) {
    console.error('[mlbg/award] AI 평가 실패 — fallback 1.0', err);
    return { multiplier: 1.0, reason: 'AI 평가 실패 — 기본값 적용' };
  }
}

export async function POST(req: NextRequest) {
  let body: { kind?: string; refId?: number | string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const kind = body.kind as Kind;
  const refId = Number(body.refId);
  const content = String(body.content ?? '');
  if (!kind || !(kind in BASE) || !Number.isFinite(refId) || refId <= 0) {
    return NextResponse.json({ error: 'kind/refId invalid' }, { status: 400 });
  }

  // 호출자 인증
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 작성자 검증 — refId 가 정말 본인 작성 글/댓글인지 확인
  const tableMap: Record<Kind, string> = {
    apt_post: 'apt_discussions',
    apt_comment: 'apt_discussion_comments',
    community_post: 'posts',
    community_comment: 'comments',
  };
  const table = tableMap[kind];
  const { data: row, error: rowErr } = await admin.from(table).select('author_id').eq('id', refId).maybeSingle();
  if (rowErr || !row) return NextResponse.json({ error: 'record not found' }, { status: 404 });
  if ((row as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: 'not author' }, { status: 403 });
  }

  // 중복 적립 방지 — uq_mlbg_award_kind_ref 가 막아주지만 사전 검사
  const { data: existing } = await admin
    .from('mlbg_award_log')
    .select('id, earned, multiplier')
    .eq('kind', kind).eq('ref_id', refId).maybeSingle();
  if (existing) {
    return NextResponse.json({
      ok: true,
      duplicated: true,
      earned: (existing as { earned: number }).earned,
      multiplier: (existing as { multiplier: number }).multiplier,
    });
  }

  const base = BASE[kind];
  const { multiplier, reason } = await evaluateQuality(kind, content);
  const earned = Math.round(base * multiplier * 100) / 100;

  // 로그 + 잔액 업데이트
  const { error: logErr } = await admin.from('mlbg_award_log').insert({
    user_id: user.id,
    kind,
    ref_id: refId,
    base,
    multiplier,
    earned,
    ai_reason: reason,
  });
  if (logErr) {
    // unique 충돌이면 이미 동시 처리됨 — 무시
    if (!String(logErr.message).toLowerCase().includes('duplicate')) {
      console.error('[mlbg/award] log insert error', logErr);
      return NextResponse.json({ error: logErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, duplicated: true });
  }

  // profiles.mlbg_balance += earned (atomic update via raw SQL)
  const { error: balErr } = await admin.rpc('increment_mlbg_balance', { p_user_id: user.id, p_delta: earned }).single();
  if (balErr) {
    // RPC 가 아직 없을 수 있음 — fallback 으로 select 후 update
    const { data: prof } = await admin.from('profiles').select('mlbg_balance').eq('id', user.id).maybeSingle();
    const cur = Number((prof as { mlbg_balance?: number | string | null } | null)?.mlbg_balance ?? 0);
    const next = cur + earned;
    const { error: upErr } = await admin.from('profiles').update({ mlbg_balance: next }).eq('id', user.id);
    if (upErr) {
      console.error('[mlbg/award] balance update fallback error', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, earned, multiplier, reason });
}
