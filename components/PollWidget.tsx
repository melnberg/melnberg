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
};

type Props = {
  postId: number;
  poll: PollMeta;
  options: Option[];
  votes: VoteAgg[];
  myVote: MyVote | null;
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

  const isResolved = poll.status === 'resolved';
  const hasMyVote = !!myVote;
  const canBet = !!currentUserId && !isResolved && !hasMyVote;

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
          {isResolved ? '✅ 정산 완료' : '🎰 베팅 진행중'}
        </span>
      </div>

      {/* 옵션 리스트 */}
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const agg = aggMap.get(opt.id);
          const optAmt = agg?.amount_sum ?? 0;
          const optCount = agg?.count ?? 0;
          const pct =
            totalPool > 0 ? Math.round((optAmt / totalPool) * 100) : 0;
          // 배당률 — open 상태에서만 의미. (전체 풀 / 옵션 풀). 옵션 풀 0 이면 — 표기.
          const odds = optAmt > 0 ? totalPool / optAmt : 0;
          const isMine = myVote?.option_id === opt.id;
          const isCorrect = isResolved && correctOptionId === opt.id;

          // 베팅 단계 — radio 로 선택
          const radioSelectable = canBet;
          const isRadioChecked = canBet && selectedOption === opt.id;

          return (
            <label
              key={opt.id}
              className={
                'relative block w-full border p-0 ' +
                (isCorrect
                  ? 'border-cyan border-2 '
                  : isMine
                  ? 'border-cyan '
                  : 'border-border ') +
                (radioSelectable ? 'cursor-pointer hover:opacity-90' : '')
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
                    'font-semibold break-keep flex-1 flex items-center gap-1.5 ' +
                    (isMine ? 'text-cyan font-bold' : '')
                  }
                >
                  {isCorrect && <span className="text-cyan">✓</span>}
                  {isMine && !isCorrect && (
                    <span className="text-cyan">●</span>
                  )}
                  {opt.label}
                </span>
                <span className="font-bold tabular-nums shrink-0 text-right text-[12px]">
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
                </span>
              </div>
            </label>
          );
        })}
      </div>

      {/* 푸터 — 풀 요약 */}
      <div className="text-[11px] text-muted mt-3 flex items-center justify-between flex-wrap gap-2">
        <span>
          총 풀 <span className="text-navy font-bold">{fmtMlbg(totalPool)} mlbg</span>{' '}
          · {totalCount}명 참여
        </span>
        {!currentUserId && !isResolved && <span>베팅은 로그인 후 가능</span>}
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

      {/* 본인 베팅 표시 — open + 이미 베팅 */}
      {!isResolved && hasMyVote && myVote && (
        <div className="mt-4 pt-3 border-t border-border text-[12px]">
          <div className="text-cyan font-bold">
            내 베팅:{' '}
            {options.find((o) => o.id === myVote.option_id)?.label ?? '?'} 에{' '}
            {fmtMlbg(myVote.amount)} mlbg
          </div>
          <div className="text-[11px] text-muted mt-0.5">
            한 번 베팅하면 변경 불가. 작성자가 정답 결정 시 자동 정산됨.
          </div>
        </div>
      )}

      {/* 정산 결과 — resolved + 본인 베팅 */}
      {isResolved && hasMyVote && myVote && (
        <div className="mt-4 pt-3 border-t border-border text-[12px]">
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
        </div>
      )}

      {/* 작성자 정산 섹션 — open + 작성자 */}
      {!isResolved && isAuthor && (
        <div className="mt-4 pt-3 border-t-2 border-red-300 flex flex-col gap-2">
          <div className="text-[12px] font-bold text-red-600">
            작성자 정산 — 정답 옵션을 골라 정산하면 되돌릴 수 없음.
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
              {resolving ? '정산 중...' : '정산하기 →'}
            </button>
          </div>
        </div>
      )}

      {/* 정산 완료 안내 */}
      {isResolved && (
        <div className="mt-4 pt-3 border-t border-border text-[11px] text-muted">
          정답:{' '}
          <span className="text-navy font-bold">
            {options.find((o) => o.id === correctOptionId)?.label ?? '—'}
          </span>
          {winnerPool === 0 && (
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
