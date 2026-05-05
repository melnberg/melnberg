import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Kind = 'apt_post' | 'apt_comment' | 'community_post' | 'community_comment' | 'hotdeal_post' | 'hotdeal_comment';

const VALID_KINDS: Kind[] = ['apt_post', 'apt_comment', 'community_post', 'community_comment', 'hotdeal_post', 'hotdeal_comment'];

// 결정론적 정책 — AI 평가 제거. 줄 수 기반 고정 지급.
//   글 (community/hotdeal): 기본 2 mlbg
//   글 (apt):
//     1줄: 0 mlbg (지급 없음)
//     2~4줄: 2 mlbg (기본)
//     5~9줄: 3 mlbg
//     10줄+: 5 mlbg
//   댓글 (어디든): 0.5 mlbg
function countLines(content: string): number {
  return (content ?? '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0).length;
}

// 단지 토론 정책 — 20자 = 1줄 환산. \n 줄 수와 글자 수 환산 줄 중 큰 값 사용.
//   1줄 (20자~39자):     0 (미지급)
//   2~4줄 (40자~99자):   2
//   5~9줄 (100자~199자): 3
//   10줄+ (200자+):      5
function evaluateAward(kind: Kind, content: string): { earned: number; reason: string } {
  if (kind.endsWith('_comment')) return { earned: 0.5, reason: '댓글' };
  const text = (content ?? '').trim();
  const nlLines = countLines(text);
  const charLines = Math.floor(text.length / 20);
  const lines = Math.max(nlLines, charLines);
  if (kind === 'apt_post') {
    const earned = lines >= 10 ? 5 : lines >= 5 ? 3 : lines >= 2 ? 2 : 0;
    return { earned, reason: `단지 토론 (${lines}줄 환산)` };
  }
  return { earned: 2, reason: '글 작성 기본' };
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
  if (!kind || !VALID_KINDS.includes(kind) || !Number.isFinite(refId) || refId <= 0) {
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

  // 중복 적립 방지
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

  const { earned, reason } = evaluateAward(kind, content);
  // 0 mlbg 도 로그는 남김 (아파트 1줄 케이스). multiplier 는 1 고정 (deprecated).

  const { error: logErr } = await admin.from('mlbg_award_log').insert({
    user_id: user.id,
    kind,
    ref_id: refId,
    base: earned,
    multiplier: 1,
    earned,
    ai_reason: reason,
  });
  if (logErr) {
    if (!String(logErr.message).toLowerCase().includes('duplicate')) {
      console.error('[mlbg/award] log insert error', logErr);
      return NextResponse.json({ error: logErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, duplicated: true });
  }

  if (earned > 0) {
    const { error: balErr } = await admin.rpc('increment_mlbg_balance', { p_user_id: user.id, p_delta: earned }).single();
    if (balErr) {
      const { data: prof } = await admin.from('profiles').select('mlbg_balance').eq('id', user.id).maybeSingle();
      const cur = Number((prof as { mlbg_balance?: number | string | null } | null)?.mlbg_balance ?? 0);
      const next = cur + earned;
      const { error: upErr } = await admin.from('profiles').update({ mlbg_balance: next }).eq('id', user.id);
      if (upErr) {
        console.error('[mlbg/award] balance update fallback error', upErr);
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, earned, multiplier: 1, reason });
}
