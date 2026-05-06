import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Kind = 'apt_post' | 'apt_comment' | 'community_post' | 'community_comment' | 'hotdeal_post' | 'hotdeal_comment' | 'factory_comment' | 'emart_comment';

const VALID_KINDS: Kind[] = ['apt_post', 'apt_comment', 'community_post', 'community_comment', 'hotdeal_post', 'hotdeal_comment', 'factory_comment', 'emart_comment'];

// 결정론적 정책 — AI 평가 제거. 줄 수 + 시간대/사진 보너스 기반.
//   글 (community):     2 mlbg (기본) / 20 mlbg (출퇴근 인사 보너스)
//   글 (hotdeal):       7 mlbg
//   글 (apt):           줄 수 기반 0/2/3/5
//   댓글 (community):   0.5 (기본) / 1.5 (출퇴근 인사 글에 시간대 댓글)
//   댓글 (hotdeal):     1 (강화)
//   댓글 (apt/factory/emart): 0.5
//   게시글 농사 (별도 award): 댓글 1개당 글 작성자에게 community 0.5, hotdeal 2 (1인당 1글 1회)
function countLines(content: string): number {
  return (content ?? '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0).length;
}

// KST 출퇴근 시간대 — 07:00~08:59 또는 18:00~19:59
function isGreetingTimeKST(): boolean {
  const h = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }), 10);
  return (h === 7 || h === 8) || (h === 18 || h === 19);
}

// 본인이 업로드한 사진이 본문에 포함됐는지 — Supabase storage post-images/{userId}/ 패턴 검사
function hasOwnUploadedImage(content: string, userId: string): boolean {
  const re = new RegExp(`/storage/v1/object/public/post-images/${userId}/[^\\s]+\\.(?:jpe?g|png|webp|gif)`, 'i');
  return re.test(content ?? '');
}

function evaluateAward(kind: Kind, content: string): { earned: number; reason: string } {
  if (kind.endsWith('_comment')) {
    // 댓글 base — community 0.5, hotdeal 1, apt 1, 그 외 (factory/emart) 0.5
    const earned = kind === 'hotdeal_comment' ? 1
                 : kind === 'apt_comment' ? 1
                 : 0.5;
    return { earned, reason: '댓글' };
  }
  const text = (content ?? '').trim();
  const nlLines = countLines(text);
  const charLines = Math.floor(text.length / 20);
  const lines = Math.max(nlLines, charLines);
  if (kind === 'apt_post') {
    const earned = lines >= 10 ? 5 : lines >= 5 ? 3 : lines >= 2 ? 2 : 0;
    return { earned, reason: `단지 토론 (${lines}줄 환산)` };
  }
  if (kind === 'hotdeal_post') return { earned: 7, reason: '핫딜 글 (강화 보상)' };
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
    factory_comment: 'factory_comments',
    emart_comment: 'emart_comments',
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

  let { earned, reason } = evaluateAward(kind, content);

  // 출퇴근 인사 보너스 — community 글 + 시간대 + 본인 사진 → 20 mlbg + posts.is_greeting=true
  let markGreeting = false;
  if (kind === 'community_post' && isGreetingTimeKST() && hasOwnUploadedImage(content, user.id)) {
    earned = 20;
    reason = '출퇴근 인사 보너스 (사진 첨부)';
    markGreeting = true;
  }

  // 인사 글 댓글 가중치 — community_comment + 부모 글 is_greeting=true + 현재 시간대 → ×3 (1.5)
  let parentPostId: number | null = null;
  let parentAuthorId: string | null = null;
  let parentCategory: 'community' | 'hotdeal' | null = null;
  if (kind === 'community_comment' || kind === 'hotdeal_comment') {
    const { data: cmt } = await admin
      .from('comments')
      .select('post_id, post:posts!post_id(id, author_id, category, is_greeting)')
      .eq('id', refId).maybeSingle();
    const c = cmt as { post_id: number; post: { id: number; author_id: string; category: string; is_greeting: boolean } | null } | null;
    if (c?.post) {
      parentPostId = c.post.id;
      parentAuthorId = c.post.author_id;
      parentCategory = c.post.category === 'hotdeal' ? 'hotdeal' : 'community';
      if (kind === 'community_comment' && c.post.is_greeting && isGreetingTimeKST()) {
        earned = 1.5;
        reason = '인사 글 댓글 (×3 가중치)';
      }
    }
  }

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

  // 출퇴근 인사 마킹 — community_post 인 경우만
  if (markGreeting) {
    await admin.from('posts').update({ is_greeting: true }).eq('id', refId).then((r) => r, () => null);
  }

  // 게시글 농사 보너스 — 댓글 작성 시 글 작성자에게 1회 가산.
  // (post_id, commenter_id) UNIQUE 로 중복 방지. 본인이 본인 글에 댓글이면 스킵.
  let farmAwarded: number | null = null;
  if ((kind === 'community_comment' || kind === 'hotdeal_comment') && parentPostId && parentAuthorId && parentCategory && parentAuthorId !== user.id) {
    const farmAmount = parentCategory === 'hotdeal' ? 2 : 0.5;
    const { error: farmErr } = await admin.from('mlbg_farm_log').insert({
      post_id: parentPostId,
      post_author_id: parentAuthorId,
      commenter_id: user.id,
      category: parentCategory,
      earned: farmAmount,
    });
    if (!farmErr) {
      // 처음 다는 댓글 — 글 작성자에게 farm 가산
      const { error: farmBalErr } = await admin.rpc('increment_mlbg_balance', { p_user_id: parentAuthorId, p_delta: farmAmount }).single();
      if (farmBalErr) {
        const { data: prof } = await admin.from('profiles').select('mlbg_balance').eq('id', parentAuthorId).maybeSingle();
        const cur = Number((prof as { mlbg_balance?: number | string | null } | null)?.mlbg_balance ?? 0);
        await admin.from('profiles').update({ mlbg_balance: cur + farmAmount }).eq('id', parentAuthorId).then((r) => r, () => null);
      }
      farmAwarded = farmAmount;
    }
    // farmErr가 unique constraint violation 이면 (이미 그 commenter 가 그 글에 보너스 받았음) 무시
  }

  return NextResponse.json({ ok: true, earned, multiplier: 1, reason, farm: farmAwarded });
}
