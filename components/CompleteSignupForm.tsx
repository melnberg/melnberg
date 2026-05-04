'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function normalizeLink(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^javascript:/i.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export default function CompleteSignupForm({
  initialName, initialNaverId, initialLink, initialPhone, next,
}: {
  initialName: string | null;
  initialNaverId: string | null;
  initialLink: string | null;
  initialPhone: string | null;
  next: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(initialName ?? '');
  const [naverId, setNaverId] = useState(initialNaverId ?? '');
  const [linkUrl, setLinkUrl] = useState(initialLink ?? '');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);

    const nameT = name.trim();
    if (nameT.length < 2 || nameT.length > 20) { setErr('닉네임은 2~20자.'); return; }

    const cleanNaverId = naverId.trim().split('@')[0] || null;
    if (cleanNaverId) {
      if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(cleanNaverId)) { setErr('네이버 ID에 한글을 넣을 수 없어요.'); return; }
      if (!/^[a-z0-9_-]+$/i.test(cleanNaverId)) { setErr('네이버 ID는 영문·숫자·_·- 만 가능.'); return; }
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) { setErr('휴대폰 번호를 입력해주세요.'); return; }
    if (!/^01[016789]\d{7,8}$/.test(cleanPhone)) {
      setErr('휴대폰 번호 형식이 올바르지 않아요. (예: 010-1234-5678)');
      return;
    }

    const cleanLink = normalizeLink(linkUrl);
    if (linkUrl.trim() && !cleanLink) { setErr('잘못된 링크 형식.'); return; }

    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErr('로그인이 필요해요.'); setBusy(false); return; }

      // 중복 검사 (본인 제외)
      const { data: dupName } = await supabase.from('profiles').select('id').eq('display_name', nameT).neq('id', user.id).limit(1);
      if (dupName?.length) { setErr(`이미 사용 중인 닉네임: "${nameT}".`); setBusy(false); return; }
      if (cleanNaverId) {
        const { data: dupId } = await supabase.from('profiles').select('id').eq('naver_id', cleanNaverId).neq('id', user.id).limit(1);
        if (dupId?.length) { setErr(`이미 가입된 네이버 ID: "${cleanNaverId}".`); setBusy(false); return; }
      }
      if (cleanPhone) {
        const { data: dupPhone } = await supabase.from('profiles').select('id').eq('phone', cleanPhone).neq('id', user.id).limit(1);
        if (dupPhone?.length) { setErr('이미 가입된 휴대폰 번호.'); setBusy(false); return; }
      }

      const { error } = await supabase.from('profiles').update({
        display_name: nameT,
        naver_id: cleanNaverId,
        link_url: cleanLink,
        phone: cleanPhone || null,
        profile_completed_at: new Date().toISOString(),
      }).eq('id', user.id);
      if (error) { setErr(`저장 실패: ${error.message}`); setBusy(false); return; }

      router.push(next || '/');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="닉네임" id="name" value={name} onChange={setName} placeholder="공개 닉네임 (실명 X)" required minLength={2} maxLength={20} />
      <Field label="네이버 카페 로그인 아이디 (선택)" id="naver" value={naverId} onChange={setNaverId} placeholder="예: rok22222" />
      <p className="text-[11px] text-muted leading-relaxed -mt-2 px-0.5">
        멜른버그 카페 조합원이라면 네이버 로그인 ID + 닉네임 일치 시 자동 인증됩니다.
      </p>
      <Field label="휴대폰 번호" id="phone" value={phone} onChange={setPhone} placeholder="010-1234-5678" required />
      <Field label="블로그·SNS 링크 (선택)" id="link" value={linkUrl} onChange={setLinkUrl} placeholder="https://blog.naver.com/..." />

      {err && <div className="text-[12px] px-3 py-2 bg-red-50 text-red-700 border border-red-200">{err}</div>}

      <button
        type="submit"
        disabled={busy}
        className="bg-navy text-white border-none px-6 py-3.5 text-[13px] font-bold tracking-wider uppercase cursor-pointer mt-2 hover:bg-navy-dark disabled:opacity-50"
      >
        {busy ? '저장 중...' : '가입 완료 →'}
      </button>
    </form>
  );
}

function Field({ label, id, value, onChange, placeholder, required, minLength, maxLength }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; minLength?: number; maxLength?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-bold tracking-widest uppercase text-muted">{label}</label>
      <input
        id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        required={required} minLength={minLength} maxLength={maxLength}
        className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none"
      />
    </div>
  );
}
