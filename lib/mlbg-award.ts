// 글/댓글 INSERT 후 호출하는 AI 평가 적립 helper.
// fire-and-forget 으로 사용 권장 — 작성 흐름을 막지 않음.
// 평가 결과(earned, multiplier, reason)를 보여주고 싶으면 await 해서 반환값 사용.

export type MlbgAwardKind = 'apt_post' | 'apt_comment' | 'community_post' | 'community_comment';

export type MlbgAwardResult =
  | { ok: true; earned: number; multiplier: number; reason?: string; duplicated?: boolean }
  | { ok: false; error: string };

export async function awardMlbg(kind: MlbgAwardKind, refId: number, content: string): Promise<MlbgAwardResult> {
  try {
    const res = await fetch('/api/mlbg/award', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, refId, content }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    return { ok: true, earned: Number(json.earned ?? 0), multiplier: Number(json.multiplier ?? 1), reason: json.reason, duplicated: !!json.duplicated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

// Toast 용 메시지 — 멀티플라이어 따라 톤이 다름
export function awardToastMessage(r: MlbgAwardResult): string {
  if (!r.ok) return '';
  if (r.duplicated) return '';
  const m = r.multiplier;
  if (m <= 0.3) return `+${r.earned} mlbg (AI 평가: 부실 ${m}배). 더 정성있게 써주면 더 받음.`;
  if (m <= 0.7) return `+${r.earned} mlbg (AI 평가: 보통 ${m}배)`;
  if (m >= 1.3) return `+${r.earned} mlbg (AI 평가: 정성 ${m}배 ↑)`;
  return `+${r.earned} mlbg`;
}
