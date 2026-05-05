import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

type Kind = 'apt_post' | 'apt_comment' | 'community_post' | 'community_comment' | 'hotdeal_post' | 'hotdeal_comment';

const BASE: Record<Kind, number> = {
  apt_post: 1.0,
  apt_comment: 0.5,
  community_post: 2.0,
  community_comment: 0.3,
  hotdeal_post: 5.0,         // 핫딜 글 — 일반 커뮤글의 2.5배
  hotdeal_comment: 1.0,      // 핫딜 댓글 — 일반 커뮤댓글의 ~3배
};

const KIND_LABEL: Record<Kind, string> = {
  apt_post: '아파트 단지 평가 글',
  apt_comment: '아파트 단지 평가 댓글',
  community_post: '커뮤니티 게시판 글',
  community_comment: '커뮤니티 게시판 댓글',
  hotdeal_post: '핫딜 정보 글',
  hotdeal_comment: '핫딜 댓글',
};

// AI 평가 — multiplier 0.1 ~ 1.5 범위로 반환
async function evaluateQuality(kind: Kind, content: string): Promise<{ multiplier: number; reason: string }> {
  const text = (content ?? '').trim();
  if (!text) return { multiplier: 0.1, reason: '내용 없음' };

  const oa = getOpenAI();
  const sys = `너는 부동산 커뮤니티 글의 정보가치를 엄격하게 평가하는 심사위원이야.
판정 결과는 반드시 JSON 으로만 답해: {"score": <0.1~1.5 사이 숫자>, "reason": "<짧은 한 줄 사유>"}

[엄격 채점 가이드 — 길이가 정보가치의 핵심 요소]

0.1 ~ 0.2 (의미없음·스팸):
- 한두 단어, 이모지만, 욕설, 광고, 의미불명

0.3 ~ 0.4 (단순 한 줄):
- "역 가깝다", "주차장 있음", "조용함" 같은 한 줄 단편 사실
- 50자 미만의 짧은 감상·의견

0.5 ~ 0.7 (보통 — 짧지만 핵심 있음):
- 한두 문장으로 명확한 정보·의견 전달 (50~150자)
- 단순 후기·평가

0.8 ~ 1.0 (디테일 있음 — 보통 글):
- 여러 측면 다룸 (주차/입지/가격/거주 등 2개 이상)
- 150~400자의 본격적인 글, 구체 사례·수치 포함

1.1 ~ 1.3 (정성있는 분석):
- 400~800자, 자기 경험·관찰 풍부
- 여러 단지 비교, 변동 추세, 구체 데이터

1.4 ~ 1.5 (걸작):
- 800자 이상의 깊이있는 분석
- 여러 관점·근거·데이터 종합

[하드룰 — 무조건 지킴]
- 1줄 + 50자 이하 (한 문장 정도)는 무조건 0.1
  · 예: "평택 원주민의 워너비 배다리공원뷰가 멋짐니다"
  · 예: "역세권이라 좋아요"
  · 예: "10억이하 저렴한 동2"
- 줄바꿈 기준 2줄 이하 (한두 문장)는 절대 0.3 초과 금지
- 100자 미만 글은 절대 0.5 초과 금지
- 200자 미만 글은 절대 0.9 초과 금지
- 400자 미만 글은 절대 1.2 초과 금지
- 1.4 이상은 800자 이상 + 깊이있는 분석에서만
- 길이만 길고 내용 빈약하면 (반복·횡설수설) 200자 단위로 0.1씩 차감

평가 시 글자 수와 줄 수 직접 세서 하드룰 어기지 마라.
짧은 글은 정보가치 있어 보여도 그냥 0.1. 정성껏 써야 보상.`;

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
    hotdeal_post: 'posts',
    hotdeal_comment: 'comments',
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
