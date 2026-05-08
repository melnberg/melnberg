// 게시글 베팅(폴) 데이터 fetch — 5개 게시판 상세 페이지에서 공통 사용.
// poll 없으면 모두 빈/null 반환. PollWidget 은 poll 있을 때만 렌더하면 됨.
//
// 177 마이그레이션 후: parimutuel 베팅 — status (open/resolved) +
// correct_option_id + total_pool, votes 는 option 별 amount_sum + count,
// myVote 는 amount + payout 동반.

import { createClient } from './supabase/server';

export type PollOption = { id: number; idx: number; label: string };
export type PollVoteAgg = {
  option_id: number;
  count: number;
  amount_sum: number;
};
export type PollMyVote = {
  option_id: number;
  amount: number;
  payout: number | null;
};
export type PollMeta = {
  post_id: number;
  question: string | null;
  status: 'open' | 'resolved';
  correct_option_id: number | null;
  total_pool: number;
  resolved_at: string | null;
  mode: 'bet' | 'vote';
  ends_at: string | null;
};

export type PollVoter = {
  user_id: string;
  option_id: number;
  display_name: string | null;
  avatar_url: string | null;
};

export type PollData = {
  poll: PollMeta | null;
  options: PollOption[];
  votes: PollVoteAgg[];
  myVote: PollMyVote | null;
  voters: PollVoter[];
};

export async function fetchPostPoll(
  postId: number,
  userId: string | null,
): Promise<PollData> {
  const supabase = await createClient();

  // mode/ends_at 컬럼은 SQL 182/184 미실행 시 없을 수 있음 — 실패 시 단계적 fallback
  const { data: poll, error: pollErr } = await supabase
    .from('post_polls')
    .select('post_id, question, status, correct_option_id, total_pool, resolved_at, mode, ends_at')
    .eq('post_id', postId)
    .maybeSingle();
  let pollRowSafe = poll as Record<string, unknown> | null;
  if (pollErr || !pollRowSafe) {
    // ends_at 없는 환경 → mode 만 select
    const retryMode = await supabase
      .from('post_polls')
      .select('post_id, question, status, correct_option_id, total_pool, resolved_at, mode')
      .eq('post_id', postId)
      .maybeSingle();
    pollRowSafe = (retryMode.data as Record<string, unknown> | null) ?? null;
    if (!pollRowSafe) {
      // mode 도 없는 환경 → 기본 select
      const retry = await supabase
        .from('post_polls')
        .select('post_id, question, status, correct_option_id, total_pool, resolved_at')
        .eq('post_id', postId)
        .maybeSingle();
      pollRowSafe = (retry.data as Record<string, unknown> | null) ?? null;
    }
  }

  if (!pollRowSafe) {
    return { poll: null, options: [], votes: [], myVote: null, voters: [] };
  }

  const { data: optsData } = await supabase
    .from('post_poll_options')
    .select('id, idx, label')
    .eq('post_id', postId)
    .order('idx', { ascending: true });
  const options: PollOption[] = (optsData ?? []) as PollOption[];

  let votes: PollVoteAgg[] = [];
  if (options.length > 0) {
    const { data: votesByOpt } = await supabase
      .from('post_poll_votes')
      .select('option_id, amount')
      .eq('post_id', postId);
    const countMap = new Map<number, number>();
    const sumMap = new Map<number, number>();
    for (const v of (votesByOpt ?? []) as Array<{
      option_id: number;
      amount: number | string | null;
    }>) {
      countMap.set(v.option_id, (countMap.get(v.option_id) ?? 0) + 1);
      const amt = Number(v.amount ?? 0);
      sumMap.set(v.option_id, (sumMap.get(v.option_id) ?? 0) + amt);
    }
    votes = options.map((o) => ({
      option_id: o.id,
      count: countMap.get(o.id) ?? 0,
      amount_sum: sumMap.get(o.id) ?? 0,
    }));
  }

  let myVote: PollMyVote | null = null;
  if (userId) {
    const { data: mine } = await supabase
      .from('post_poll_votes')
      .select('option_id, amount, payout')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    if (mine) {
      const m = mine as {
        option_id: number;
        amount: number | string | null;
        payout: number | string | null;
      };
      myVote = {
        option_id: m.option_id,
        amount: Number(m.amount ?? 0),
        payout: m.payout == null ? null : Number(m.payout),
      };
    }
  }

  const pollRow = pollRowSafe as {
    post_id: number;
    question: string | null;
    status: string | null;
    correct_option_id: number | null;
    total_pool: number | string | null;
    resolved_at: string | null;
    mode?: string | null;
    ends_at?: string | null;
  };

  // 투표 모드 — 옵션별 참가자 fetch (작은 아바타 표시용)
  let voters: PollVoter[] = [];
  const isVoteMode = pollRow.mode === 'vote';
  if (isVoteMode) {
    const { data: voteRows } = await supabase
      .from('post_poll_votes')
      .select('user_id, option_id')
      .eq('post_id', postId);
    const voteList = (voteRows ?? []) as Array<{ user_id: string; option_id: number }>;
    if (voteList.length > 0) {
      const userIds = Array.from(new Set(voteList.map((v) => v.user_id)));
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);
      const profMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
      for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>) {
        profMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url });
      }
      voters = voteList.map((v) => ({
        user_id: v.user_id,
        option_id: v.option_id,
        display_name: profMap.get(v.user_id)?.display_name ?? null,
        avatar_url: profMap.get(v.user_id)?.avatar_url ?? null,
      }));
    }
  }

  return {
    poll: {
      post_id: pollRow.post_id,
      question: pollRow.question,
      status: pollRow.status === 'resolved' ? 'resolved' : 'open',
      correct_option_id: pollRow.correct_option_id,
      total_pool: Number(pollRow.total_pool ?? 0),
      resolved_at: pollRow.resolved_at,
      mode: isVoteMode ? 'vote' : 'bet',
      ends_at: pollRow.ends_at ?? null,
    },
    options,
    votes,
    myVote,
    voters,
  };
}
