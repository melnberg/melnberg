'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  initial: {
    display_name: string;
    naver_id: string | null;
    link_url: string | null;
    is_solo: boolean;
    bio: string;
  };
  email: string;
  isPaid: boolean;
};

function normalizeUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^javascript:/i.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function Row({ label, sublabel, children }: { label: string; sublabel?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <span className="text-[12px] font-bold tracking-widest uppercase text-muted">{label}</span>
        {sublabel && <span className="text-[10px] normal-case font-medium text-muted">{sublabel}</span>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function ProfileForm({ initial, email, isPaid }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(initial.display_name);
  const [naverId, setNaverId] = useState(initial.naver_id ?? '');
  const [linkUrl, setLinkUrl] = useState(initial.link_url ?? '');
  const [isSolo, setIsSolo] = useState(initial.is_solo);
  const [bio, setBio] = useState(initial.bio);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  const dirty =
    name.trim() !== initial.display_name ||
    (naverId.trim() || null) !== (initial.naver_id?.trim() || null) ||
    (linkUrl.trim() || null) !== (initial.link_url?.trim() || null) ||
    isSolo !== initial.is_solo ||
    bio.trim() !== initial.bio.trim();

  async function handleSave() {
    if (saving || !dirty) return;
    setMsg(null);

    // 검증
    const nameT = name.trim();
    if (nameT.length < 2 || nameT.length > 20) {
      setMsg({ type: 'error', text: '닉네임은 2~20자로 입력해주세요.' });
      return;
    }
    const naverClean = naverId.trim().split('@')[0];
    if (naverClean && /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(naverClean)) {
      setMsg({ type: 'error', text: '네이버 ID에 한글을 넣을 수 없습니다.' });
      return;
    }
    if (naverClean && !/^[a-z0-9_-]+$/i.test(naverClean)) {
      setMsg({ type: 'error', text: '네이버 ID는 영문·숫자·_·- 만 가능합니다.' });
      return;
    }
    let linkClean: string | null = null;
    if (linkUrl.trim()) {
      linkClean = normalizeUrl(linkUrl);
      if (!linkClean) { setMsg({ type: 'error', text: '잘못된 URL 형식입니다.' }); return; }
      if (linkClean.length > 500) { setMsg({ type: 'error', text: 'URL이 너무 깁니다 (500자 초과).' }); return; }
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setMsg({ type: 'error', text: '로그인이 필요합니다.' });
      return;
    }

    // 한 번에 update — auth metadata 도 동기화 (사이드바 즉시 반영)
    const updates: Record<string, unknown> = {};
    if (nameT !== initial.display_name) updates.display_name = nameT;
    if ((naverClean || null) !== (initial.naver_id || null)) updates.naver_id = naverClean || null;
    if (linkClean !== (initial.link_url || null)) updates.link_url = linkClean;
    if (isSolo !== initial.is_solo) updates.is_solo = isSolo;
    if (bio.trim() !== initial.bio.trim()) updates.bio = bio.trim() || null;

    const errors: Array<{ message: string } | null> = [];
    if (Object.keys(updates).length > 0) {
      const r = await supabase.from('profiles').update(updates).eq('id', user.id);
      errors.push(r.error);
    }
    if (updates.display_name) {
      const r = await supabase.auth.updateUser({ data: { display_name: nameT } });
      errors.push(r.error);
    }
    const firstErr = errors.find((e) => e);

    // 카페 유료회원 매칭 재평가 (닉네임 또는 네이버ID 변경 시)
    // 매칭 → 조합원 승격
    // 비매칭 → 카페 매칭으로 받은 등급(tier_expires_at = 2099-12-31)이면 강등.
    //           토스 결제로 받은 등급(현실적 만료일)은 유지.
    let tierMsg: string | null = null;
    if (!firstErr && (updates.display_name || updates.naver_id !== undefined)) {
      let isMatched = false;
      if (naverClean) {
        const { data: matched } = await supabase
          .from('cafe_paid_members')
          .select('naver_id')
          .eq('naver_id', naverClean)
          .eq('cafe_nickname', nameT)
          .maybeSingle();
        isMatched = !!matched;
      }

      if (isMatched) {
        const { error: tErr } = await supabase
          .from('profiles')
          .update({ tier: 'paid', tier_expires_at: '2099-12-31T00:00:00Z' })
          .eq('id', user.id);
        if (!tErr) tierMsg = ' · 카페 유료회원 인증 완료 → 조합원 전환';
      } else {
        // 비매칭 — 현재 카페 매칭으로 paid 였던 경우(만료일 = 2099-12-31)만 강등
        const { data: cur } = await supabase
          .from('profiles')
          .select('tier, tier_expires_at')
          .eq('id', user.id)
          .maybeSingle();
        const isPaidViaCafe =
          cur?.tier === 'paid' &&
          cur?.tier_expires_at &&
          new Date(cur.tier_expires_at).getFullYear() >= 2099;
        if (isPaidViaCafe) {
          const { error: tErr } = await supabase
            .from('profiles')
            .update({ tier: 'free', tier_expires_at: null })
            .eq('id', user.id);
          if (!tErr) tierMsg = ' · 카페 매칭 깨짐 → 무료회원 강등';
        }
      }
    }

    setSaving(false);
    if (firstErr) {
      setMsg({ type: 'error', text: `저장 실패: ${firstErr.message}` });
      return;
    }
    setMsg({ type: 'info', text: `✓ 저장됨${tierMsg ?? ''}` });
    router.refresh();
  }

  const inputCls = 'border border-border px-3 py-1.5 text-[14px] outline-none focus:border-navy rounded-none w-full max-w-[280px] text-right';

  return (
    <div className="flex flex-col gap-0">
      <div className="border border-border">
        <Row label="닉네임">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={20} className={inputCls} />
        </Row>
        <Row label="네이버 ID" sublabel="카페 유료회원 인증">
          <input type="text" value={naverId} onChange={(e) => setNaverId(e.target.value)} maxLength={50} placeholder="(미입력)" className={inputCls} />
        </Row>
        <Row label="블로그·SNS" sublabel="닉네임 클릭 시 연결 · 조합원 전용">
          <input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} maxLength={500} placeholder="(미입력)" className={inputCls} />
        </Row>
        <Row label="미혼 솔로 표시" sublabel="닉네임 옆 분홍 점 · 조합원 전용">
          {isPaid ? (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={isSolo} onChange={(e) => setIsSolo(e.target.checked)} className="w-4 h-4 accent-pink-500" />
              <span className="text-[13px] text-text">미혼 솔로일 경우 체크</span>
            </label>
          ) : (
            <span className="text-[12px] text-muted">조합원만 사용할 수 있어요</span>
          )}
        </Row>
        <Row label="이메일">
          <span className="text-[14px] text-text">{email}</span>
        </Row>
        <div className="flex flex-col px-5 py-4 gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-bold tracking-widest uppercase text-muted">자기소개</span>
            <span className="text-[10px] text-muted">{bio.length}/500</span>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="다른 회원이 닉네임을 통해 들어왔을 때 보여줄 자기소개. 비워두면 표시 안 됨."
            className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy rounded-none w-full resize-y leading-relaxed"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-[12px]">
          {msg && (
            <span className={msg.type === 'error' ? 'text-red-700' : 'text-cyan font-bold'}>{msg.text}</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="bg-navy text-white px-6 py-2.5 text-[13px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-30 disabled:cursor-not-allowed border-none"
        >
          {saving ? '저장 중...' : dirty ? '변경사항 저장' : '저장됨'}
        </button>
      </div>
    </div>
  );
}
