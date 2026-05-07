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
};

export type PollData = {
  poll: PollMeta | null;
  options: PollOption[];
  votes: PollVoteAgg[];
  myVote: PollMyVote | null;
};

export async function fetchPostPoll(
  postId: number,
  userId: string | null,
): Promise<PollData> {
  const supabase = await createClient();

  const { data: poll } = await supabase
    .from('post_polls')
    .select('post_id, question, status, correct_option_id, total_pool, resolved_at')
    .eq('post_id', postId)
    .maybeSingle();

  if (!poll) {
    return { poll: null, options: [], votes: [], myVote: null };
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

  const pollRow = poll as {
    post_id: number;
    question: string | null;
    status: string | null;
    correct_option_id: number | null;
    total_pool: number | string | null;
    resolved_at: string | null;
  };
  return {
    poll: {
      post_id: pollRow.post_id,
      question: pollRow.question,
      status: pollRow.status === 'resolved' ? 'resolved' : 'open',
      correct_option_id: pollRow.correct_option_id,
      total_pool: Number(pollRow.total_pool ?? 0),
      resolved_at: pollRow.resolved_at,
    },
    options,
    votes,
    myVote,
  };
}
