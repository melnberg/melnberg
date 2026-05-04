'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import OAuthButtons from './OAuthButtons';

export default function SignupForm() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [naverId, setNaverId] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [emailFormOpen, setEmailFormOpen] = useState(false);

  // 폰 인증 상태
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  async function sendCode() {
    if (sendingSms) return;
    const digits = phone.replace(/\D/g, '');
    if (!/^010\d{8}$/.test(digits)) {
      setMsg({ type: 'error', text: '폰번호 형식이 올바르지 않습니다 (010xxxxxxxx).' });
      return;
    }
    setMsg(null);
    setSendingSms(true);
    const r = await fetch('/api/sms/send-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits }),
    });
    const json = await r.json().catch(() => ({}));
    setSendingSms(false);
    if (!r.ok || !json.ok) {
      setMsg({ type: 'error', text: json.error ?? '인증번호 발송 실패' });
      return;
    }
    setVerificationId(json.verification_id);
    setPhoneVerified(false);
    setCode('');
    setMsg({ type: 'info', text: `인증번호가 발송되었습니다. ${json.ttl_min}분 내에 입력해주세요.` });
  }

  async function verifyCode() {
    if (verifyingCode || !verificationId) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setMsg({ type: 'error', text: '6자리 숫자 인증번호를 입력해주세요.' });
      return;
    }
    setMsg(null);
    setVerifyingCode(true);
    const r = await fetch('/api/sms/verify-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verification_id: verificationId, code: code.trim(), phone: phone.replace(/\D/g, '') }),
    });
    const json = await r.json().catch(() => ({}));
    setVerifyingCode(false);
    if (!r.ok || !json.ok) {
      setMsg({ type: 'error', text: json.error ?? '인증번호 확인 실패' });
      return;
    }
    setPhoneVerified(true);
    setMsg({ type: 'info', text: '폰 인증 완료 ✓' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setMsg(null);

    if (!phoneVerified || !verificationId) {
      setMsg({ type: 'error', text: '폰 인증을 먼저 완료해주세요.' });
      return;
    }

    // 사용자가 풀 이메일을 입력해도 앞부분만 저장
    const cleanNaverId = naverId.trim().split('@')[0];
    if (cleanNaverId && /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(cleanNaverId)) {
      setMsg({ type: 'error', text: '네이버 로그인 아이디에 한글을 넣을 수 없습니다.\n닉네임이 아니라 영문·숫자로 된 네이버 로그인 ID를 입력해주세요. (예: hodol9876)' });
      return;
    }
    if (cleanNaverId && !/^[a-z0-9_-]+$/i.test(cleanNaverId)) {
      setMsg({ type: 'error', text: '네이버 로그인 아이디는 영문·숫자·_·- 만 가능합니다.' });
      return;
    }

    let cleanLink: string | null = null;
    const rawLink = linkUrl.trim();
    if (rawLink) {
      if (/^javascript:/i.test(rawLink)) {
        setMsg({ type: 'error', text: '잘못된 링크 형식입니다.' });
        return;
      }
      cleanLink = /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;
      if (cleanLink.length > 500) {
        setMsg({ type: 'error', text: '링크가 너무 깁니다 (500자 초과).' });
        return;
      }
    }

    setLoading(true);
    // 가입 — 서버 라우트가 폰 인증·중복 검사·생성 모두 수행
    const r = await fetch('/api/auth/signup-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        phone: phone.replace(/\D/g, ''),
        verification_id: verificationId,
        display_name: name.trim(),
        naver_id: cleanNaverId || null,
        link_url: cleanLink,
      }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.ok) {
      setLoading(false);
      setMsg({ type: 'error', text: json.error ?? '가입 실패' });
      return;
    }

    // 가입 성공 → 자동 로그인
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (signInErr) {
      setMsg({ type: 'info', text: '가입은 완료됐지만 자동 로그인 실패. 로그인 페이지에서 로그인해주세요.' });
      setTimeout(() => router.push('/login'), 2000);
      return;
    }
    setMsg({ type: 'info', text: '가입 완료. 환영합니다!' });
    setTimeout(() => router.push('/'), 800);
  }

  return (
    <div className="flex flex-col gap-4">
      <OAuthButtons next="/" />

      {!emailFormOpen ? (
        <>
          <button
            type="button"
            onClick={() => setEmailFormOpen(true)}
            className="w-full bg-white border border-border text-text py-3 text-[13px] font-bold flex items-center justify-center gap-2 hover:border-navy cursor-pointer"
          >
            이메일로 가입하기
          </button>
          <p className="text-sm text-muted text-center mt-2">
            이미 계정이 있나요?{' '}
            <Link href="/login" className="text-navy font-semibold no-underline hover:underline">로그인</Link>
          </p>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted">이메일로 가입</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <Field label="이메일" id="email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
          <Field label="비밀번호" id="password" type="password" value={password} onChange={setPassword} placeholder="8자 이상" required minLength={8} />

          {/* 휴대폰 인증 */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-[11px] font-bold tracking-widest uppercase text-muted">휴대폰 번호</label>
            <div className="flex gap-2">
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setPhoneVerified(false); setVerificationId(null); }}
                placeholder="01012345678"
                required
                maxLength={13}
                disabled={phoneVerified}
                className="flex-1 border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none disabled:bg-[#f5f5f5]"
              />
              <button
                type="button"
                onClick={sendCode}
                disabled={sendingSms || phoneVerified}
                className="px-3 py-2 bg-white border border-border text-text text-[12px] font-bold whitespace-nowrap hover:border-navy disabled:opacity-50 cursor-pointer"
              >
                {sendingSms ? '발송 중...' : verificationId ? '재발송' : '인증번호 받기'}
              </button>
            </div>
          </div>

          {verificationId && !phoneVerified && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="code" className="text-[11px] font-bold tracking-widest uppercase text-muted">인증번호</label>
              <div className="flex gap-2">
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6자리 숫자"
                  maxLength={6}
                  className="flex-1 border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none tabular-nums"
                />
                <button
                  type="button"
                  onClick={verifyCode}
                  disabled={verifyingCode}
                  className="px-3 py-2 bg-navy text-white text-[12px] font-bold whitespace-nowrap hover:bg-navy-dark disabled:opacity-50 cursor-pointer"
                >
                  {verifyingCode ? '확인 중...' : '확인'}
                </button>
              </div>
            </div>
          )}

          {phoneVerified && (
            <div className="text-[12px] text-cyan font-bold px-1">✓ 폰 인증 완료</div>
          )}

          <Field label="네이버 ID (카페 유료회원 인증용)" id="naver_id" value={naverId} onChange={setNaverId} placeholder="예: rok22222 (@naver.com 앞부분만)" maxLength={50} />
          <p className="text-[11px] text-muted leading-relaxed -mt-2 px-0.5">
            ⓘ 카페 유료회원 자동 인식: 네이버 <b>로그인 아이디</b>와 카페 닉네임이 명부와 일치해야 합니다.
            ✗ 닉네임/이메일 풀주소 입력 금지. <code>jiroclinic@naver.com</code>이면 <b>jiroclinic</b>만.
          </p>
          <Field label="닉네임" id="name" value={name} onChange={setName} placeholder="공개 닉네임 (실명 X)" required minLength={2} maxLength={20} />
          <Field label="블로그·SNS 링크 (선택)" id="link_url" value={linkUrl} onChange={setLinkUrl} placeholder="https://blog.naver.com/..." maxLength={500} />
          <p className="text-[11px] text-muted leading-relaxed -mt-2 px-0.5">
            다른 회원이 닉네임을 클릭하면 이 링크로 연결됩니다 (새 탭).
          </p>

          {msg && (
            <div className={`text-sm px-4 py-3 break-keep leading-relaxed whitespace-pre-line ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-navy text-white'}`}>
              {msg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-navy text-white border-none px-6 py-3.5 text-[13px] font-bold tracking-wider uppercase cursor-pointer mt-2 hover:bg-navy-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '가입 중...' : '가입하기 →'}
          </button>

          <p className="text-sm text-muted text-center mt-2">
            이미 계정이 있나요?{' '}
            <Link href="/login" className="text-navy font-semibold no-underline hover:underline">로그인</Link>
          </p>
        </form>
      )}
    </div>
  );
}

function Field({
  label, id, value, onChange, type = 'text', placeholder, required, minLength, maxLength,
}: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; minLength?: number; maxLength?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-bold tracking-widest uppercase text-muted">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none"
      />
    </div>
  );
}
