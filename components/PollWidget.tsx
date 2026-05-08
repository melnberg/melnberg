'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Option = { id: number; idx: number; label: string };
type VoteAgg = { option_id: number; count: number; amount_sum: number };
type MyVote = { option_id: number; amount: number; payout: number | null };
type PollMeta = {
  post_id: number;
  question: string | null;
  status: 'open' | 'resolved';
  correct_option_id: number | null;
  total_pool: number;
  resolved_at: string | null;
  mode: 'bet' | 'vote';
};
type Voter = {
  user_id: string;
  option_id: number;
  display_name: string | null;
  avatar_url: string | null;
};

type Props = {
  postId: number;
  poll: PollMeta;
  options: Option[];
  votes: VoteAgg[];
  myVote: MyVote | null;
  voters?: Voter[];
  currentUserId: string | null;
  isAuthor: boolean;
  // worry 게시판 — 익명 표시 prop 보존 (지금은 사용 안 하지만 향후 분기용)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  anonymous?: boolean;
};

function fmtMlbg(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n - Math.round(n)) < 0.005) return Math.round(n).toString();
  return n.toFixed(2);
}

export default function PollWidget({
  postId,
  poll,
  options,
  votes,
  myVote,
  voters = [],
  currentUserId,
  isAuthor,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [amountStr, setAmountStr] = useState<string>('1');
  const [balance, setBalance] = useState<number | null>(null);

  // 정산 (작성자) 섹션
  const [resolveOption, setResolveOption] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);

  const isVoteMode = poll.mode === 'vote';
  const isResolved = poll.status === 'resolved';
  const hasMyVote = !!myVote;
  // bet 모드: 한 번만 베팅 가능. vote 모드: 변경 가능 (재투표 허용).
  const canBet = !isVoteMode && !!currentUserId && !isResolved && !hasMyVote;
  const canVote = isVoteMode && !!currentUserId && !isResolved;

  // 옵션별 집계 맵
  const aggMap = new Map<number, VoteAgg>();
  for (const v of votes) aggMap.set(v.option_id, v);

  const totalPool = poll.total_pool;
  const totalCount = votes.reduce((s, v) => s + v.count, 0);
  const correctOptionId = poll.correct_option_id;

  // 정답 옵션 풀 (정산 후 배당률 계산용)
  const winnerPool =
    isResolved && correctOptionId != null
      ? aggMap.get(correctOptionId)?.amount_sum ?? 0
      : 0;

  // 잔액 fetch — 베팅 가능한 경우만
  useEffect(() => {
    if (!canBet) return;
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('mlbg_balance')
        .eq('id', user.id)
        .maybeSingle();
      if (!alive) return;
      const p = data as { mlbg_balance?: number | null } | null;
      setBalance(Number(p?.mlbg_balance ?? 0));
    })();
    return () => {
      alive = false;
    };
  }, [canBet, supabase]);

  async function handleBet() {
    if (submitting) return;
    if (!currentUserId) {
      setErr('로그인이 필요해요');
      return;
    }
    if (selectedOption == null) {
      setErr('옵션을 선택하세요');
      return;
    }
    const amt = Number(amountStr);
    if (!Number.isFinite(amt) || amt < 1) {
      setErr('최소 1 mlbg');
      return;
    }
    if (balance != null && amt > balance) {
      setErr(`잔액 부족 (현재: ${fmtMlbg(balance)} mlbg)`);
      return;
    }
    setErr(null);
    setSubmitting(true);
    const { data, error } = await supabase.rpc('bet_post_poll', {
      p_post_id: postId,
      p_option_id: selectedOption,
      p_amount: amt,
    });
    setSubmitting(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.out_success === false) {
      setErr(row.out_message ?? '베팅 실패');
      return;
    }
    router.refresh();
  }

  async function handleVote(optId: number) {
    if (submitting) return;
    if (!currentUserId) {
      setErr('로그인이 필요해요');
      return;
    }
    setErr(null);
    setSubmitting(true);
    const { data, error } = await supabase.rpc('vote_post_poll', {
      p_post_id: postId,
      p_option_id: optId,
    });
    setSubmitting(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.out_success === false) {
      setErr(row.out_message ?? '투표 실패');
      return;
    }
    router.refresh();
  }

  async function handleResolve() {
    if (resolving) return;
    if (resolveOption == null) {
      setErr('정답 옵션을 선택하세요');
      return;
    }
    const optLabel =
      options.find((o) => o.id === resolveOption)?.label ?? '?';
    if (
      !window.confirm(
        `정답을 "${optLabel}" 으로 확정하고 정산합니다. 되돌릴 수 없어요. 진행할까요?`,
      )
    ) {
      return;
    }
    setErr(null);
    setResolving(true);
    const { data, error } = await supabase.rpc('resolve_post_poll', {
      p_post_id: postId,
      p_correct_option_id: resolveOption,
    });
    setResolving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.out_success === false) {
      setErr(row.out_message ?? '정산 실패');
      return;
    }
    router.refresh();
  }

  return (
    <div className="border border-border p-4 my-4 bg-bg/30">
      {/* 헤더 — 질문 + 상태 뱃지 */}
      <div className="flex items-start justify-between gap-3 mb-3">
        {poll.question ? (
          <div className="text-[14px] font-bold text-navy break-keep flex-1">
            {poll.question}
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <span
          className={
            'text-[11px] font-bold tracking-wide px-2 py-1 shrink-0 ' +
            (isResolved
              ? 'bg-cyan/20 text-navy border border-cyan'
              : 'bg-navy/10 text-navy border border-navy/30')
          }
        >
          {isResolved
            ? (isVoteMode ? '✅ 결과 발표' : '✅ 정산 완료')
            : (isVoteMode ? '🗳 투표 진행중' : '🎰 베팅 진행중')}
        </span>
      </div>

      {/* 옵션 리스트 */}
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const agg = aggMap.get(opt.id);
          const optAmt = agg?.amount_sum ?? 0;
          const optCount = agg?.count ?? 0;
          // 막대바 % — bet 모드: 풀 비중 / vote 모드: 표 수 비중
          const pct = isVoteMode
            ? (totalCount > 0 ? Math.round((optCount / totalCount) * 100) : 0)
            : (totalPool > 0 ? Math.round((optAmt / totalPool) * 100) : 0);
          // 배당률 — bet 모드 + open 에서만 의미.
          const odds = optAmt > 0 ? totalPool / optAmt : 0;
          const isMine = myVote?.option_id === opt.id;
          const isCorrect = isResolved && correctOptionId === opt.id;

          // bet 모드: radio 선택 후 베팅 버튼. vote 모드: 옵션 클릭만으로 즉시 투표.
          const radioSelectable = canBet;
          const isRadioChecked = canBet && selectedOption === opt.id;
          const voteClickable = canVote;

          // 옵션별 참가자 (vote 모드 only) — 본인 + 최대 4명 아바타
          const optVoters = isVoteMode ? voters.filter((v) => v.option_id === opt.id) : [];

          return (
            <label
              key={opt.id}
              onClick={(e) => {
                if (!voteClickable) return;
                e.preventDefault();
                handleVote(opt.id);
              }}
              className={
                'relative block w-full border p-0 ' +
                (isCorrect
                  ? 'border-cyan border-2 '
                  : isMine
                  ? 'border-cyan '
                  : 'border-border ') +
                (radioSelectable || voteClickable ? 'cursor-pointer hover:opacity-90' : '')
              }
            >
              {/* 막대바 배경 */}
              <div
                className={
                  'absolute inset-y-0 left-0 ' +
                  (isCorrect
                    ? 'bg-cyan/40'
                    : isMine
                    ? 'bg-cyan/30'
                    : 'bg-cyan/10')
                }
                style={{ width: `${pct}%` }}
              />
              <div className="relative z-10 flex items-center gap-3 px-3 py-2.5 text-[13px] text-navy">
                {radioSelectable && (
                  <input
                    type="radio"
                    name={`bet-${postId}`}
                    checked={isRadioChecked}
                    onChange={() => setSelectedOption(opt.id)}
                    className="w-4 h-4 accent-navy cursor-pointer shrink-0"
                  />
                )}
                <span
                  className={
                    'font-semibold break-keep flex-1 flex items-center gap-1.5 min-w-0 ' +
                    (isMine ? 'text-cyan font-bold' : '')
                  }
                >
                  {isCorrect && <span className="text-cyan">✓</span>}
                  {isMine && !isCorrect && (
                    <span className="text-cyan">●</span>
                  )}
                  <span className="truncate">{opt.label}</span>
                  {/* vote 모드 — 옵션별 작은 아바타 nav */}
                  {isVoteMode && optVoters.length > 0 && (
                    <span className="flex items-center -space-x-1.5 ml-1 shrink-0">
                      {optVoters.slice(0, 5).map((v) => (
                        <span
                          key={v.user_id}
                          title={v.display_name ?? '익명'}
                          className="w-5 h-5 rounded-full border border-white bg-bg overflow-hidden inline-block"
                        >
                          {v.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="w-full h-full flex items-center justify-center text-[9px] font-bold text-muted bg-cyan/10">
                              {(v.display_name ?? '?').slice(0, 1)}
                            </span>
                          )}
                        </span>
                      ))}
                      {optVoters.length > 5 && (
                        <span className="text-[10px] text-muted font-normal pl-2">+{optVoters.length - 5}</span>
                      )}
                    </span>
                  )}
                </span>
                <span className="font-bold tabular-nums shrink-0 text-right text-[12px]">
                  {isVoteMode ? (
                    <>
                      <span className="text-navy">{optCount}표</span>
                      <span className="text-muted font-normal"> · {pct}%</span>
                    </>
                  ) : (
                    <>
                      <span className="text-navy">{fmtMlbg(optAmt)} mlbg</span>
                      <span className="text-muted font-normal">
                        {' '}
                        · {pct}% · {optCount}명
                      </span>
                      {!isResolved && (
                        <span className="block text-[11px] text-muted font-normal">
                          배당 {optAmt > 0 ? `× ${odds.toFixed(2)}` : '—'}
                        </span>
                      )}
                      {isResolved && isCorrect && winnerPool > 0 && (
                        <span className="block text-[11px] text-cyan font-bold">
                          배당 × {(totalPool / winnerPool).toFixed(2)}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </div>
            </label>
          );
        })}
      </div>

      {/* 푸터 — 풀 요약 */}
      <div className="text-[11px] text-muted mt-3 flex items-center justify-between flex-wrap gap-2">
        {isVoteMode ? (
          <span>
            총 <span className="text-navy font-bold">{totalCount}</span>표
          </span>
        ) : (
          <span>
            총 풀 <span className="text-navy font-bold">{fmtMlbg(totalPool)} mlbg</span>{' '}
            · {totalCount}명 참여
          </span>
        )}
        {!currentUserId && !isResolved && (
          <span>{isVoteMode ? '투표는 로그인 후 가능' : '베팅은 로그인 후 가능'}</span>
        )}
      </div>

      {/* 베팅 입력 — open + 본인 미베팅 + 로그인 */}
      {canBet && (
        <div className="mt-4 pt-3 border-t border-border flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[12px] text-muted shrink-0">베팅액</label>
            <input
              type="number"
              min={1}
              max={balance ?? undefined}
              step={1}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="border border-border px-2.5 py-1.5 text-[13px] outline-none focus:border-navy rounded-none w-28 tabular-nums"
            />
            <span className="text-[12px] text-muted">
              mlbg
              {balance != null && (
                <>
                  {' '}
                  · 잔액{' '}
                  <span className="text-navy font-bold tabular-nums">
                    {fmtMlbg(balance)}
                  </span>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={handleBet}
              disabled={submitting || selectedOption == null}
              className="ml-auto bg-navy text-white border-none px-4 py-1.5 text-[12px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '베팅 중...' : '베팅 →'}
            </button>
          </div>
          <div className="text-[11px] text-muted">
            한 번 베팅하면 변경·취소 불가. 작성자가 정답 결정 시 배당률대로 자동 정산.
          </div>
        </div>
      )}

      {/* 본인 베팅/투표 표시 — open + 이미 표시 */}
      {!isResolved && hasMyVote && myVote && (
        <div className="mt-4 pt-3 border-t border-border text-[12px]">
          {isVoteMode ? (
            <>
              <div className="text-cyan font-bold">
                내 투표:{' '}
                {options.find((o) => o.id === myVote.option_id)?.label ?? '?'}
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                다른 옵션을 누르면 투표를 변경할 수 있어요.
              </div>
            </>
          ) : (
            <>
              <div className="text-cyan font-bold">
                내 베팅:{' '}
                {options.find((o) => o.id === myVote.option_id)?.label ?? '?'} 에{' '}
                {fmtMlbg(myVote.amount)} mlbg
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                한 번 베팅하면 변경 불가. 작성자가 정답 결정 시 자동 정산됨.
              </div>
            </>
          )}
        </div>
      )}

      {/* 정산/결과 — resolved + 본인 베팅/투표 */}
      {isResolved && hasMyVote && myVote && (
        <div className="mt-4 pt-3 border-t border-border text-[12px]">
          {isVoteMode ? (
            <div>
              내 투표:{' '}
              {options.find((o) => o.id === myVote.option_id)?.label ?? '?'}
              {correctOptionId === myVote.option_id ? (
                <span className="ml-2 text-cyan font-bold">✓ 정답</span>
              ) : null}
            </div>
          ) : (
            <>
              <div>
                내 베팅:{' '}
                {options.find((o) => o.id === myVote.option_id)?.label ?? '?'} 에{' '}
                {fmtMlbg(myVote.amount)} mlbg
              </div>
              <div className="mt-1 font-bold tabular-nums">
                {myVote.payout == null ? (
                  <span className="text-muted">정산 정보 없음</span>
                ) : myVote.payout > myVote.amount ? (
                  <span className="text-cyan">
                    +{fmtMlbg(myVote.payout - myVote.amount)} mlbg (총 받음{' '}
                    {fmtMlbg(myVote.payout)})
                  </span>
                ) : myVote.payout > 0 ? (
                  <span className="text-muted">
                    받음 {fmtMlbg(myVote.payout)} mlbg (-
                    {fmtMlbg(myVote.amount - myVote.payout)})
                  </span>
                ) : (
                  <span className="text-muted">잃음</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 작성자 정산/마감 섹션 — open + 작성자 */}
      {!isResolved && isAuthor && (
        <div className="mt-4 pt-3 border-t-2 border-red-300 flex flex-col gap-2">
          <div className="text-[12px] font-bold text-red-600">
            {isVoteMode
              ? '작성자 마감 — 정답 옵션을 골라 결과 확정. 환수/지급 없음. 되돌릴 수 없음.'
              : '작성자 정산 — 정답 옵션을 골라 정산하면 되돌릴 수 없음.'}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={resolveOption ?? ''}
              onChange={(e) =>
                setResolveOption(
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
              className="border border-border px-2.5 py-1.5 text-[13px] outline-none focus:border-navy rounded-none flex-1 min-w-0"
            >
              <option value="">정답 옵션 선택…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleResolve}
              disabled={resolving || resolveOption == null}
              className="bg-red-600 text-white border-none px-4 py-1.5 text-[12px] font-bold tracking-wider uppercase cursor-pointer hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resolving ? '확정 중...' : isVoteMode ? '마감하기 →' : '정산하기 →'}
            </button>
          </div>
        </div>
      )}

      {/* 정산/마감 완료 안내 */}
      {isResolved && (
        <div className="mt-4 pt-3 border-t border-border text-[11px] text-muted">
          정답:{' '}
          <span className="text-navy font-bold">
            {options.find((o) => o.id === correctOptionId)?.label ?? '—'}
          </span>
          {!isVoteMode && winnerPool === 0 && (
            <span className="ml-2 text-muted">
              · 정답 풀 0 으로 모두 환불됨
            </span>
          )}
        </div>
      )}

      {err && (
        <div className="mt-3 text-[12px] px-3 py-2 bg-red-50 text-red-700 border border-red-200">
          {err}
        </div>
      )}
    </div>
  );
}
