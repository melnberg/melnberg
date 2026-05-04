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

  // 이메일 중복 확인
  const [emailChecked, setEmailChecked] = useState<boolean | null>(null); // true=사용가능, false=중복, null=미확인
  const [checkingEmail, setCheckingEmail] = useState(false);

  async function checkEmail() {
    if (checkingEmail) return;
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@')) { setMsg({ type: 'error', text: '이메일 형식이 올바르지 않습니다.' }); return; }
    setCheckingEmail(true);
    setMsg(null);
    const r = await fetch('/api/auth/check-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e }),
    });
    const json = await r.json().catch(() => ({}));
    setCheckingEmail(false);
    if (typeof json.exists !== 'boolean') {
      setMsg({ type: 'error', text: '확인 실패. 잠시 후 재시도해주세요.' });
      return;
    }
    if (json.exists) {
      setEmailChecked(false);
      setMsg({ type: 'error', text: `이미 가입된 이메일입니다: "${e}"` });
    } else {
      setEmailChecked(true);
      setMsg({ type: 'info', text: '사용 가능한 이메일입니다.' });
    }
  }

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

    if (emailChecked !== true) {
      setMsg({ type: 'error', text: '이메일 중복 확인을 먼저 해주세요.' });
      return;
    }
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted">이메일로 가입</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Row label="이메일">
            <input
              id="email" type="email" value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailChecked(null); }}
              placeholder="you@example.com" required
              className={inputCls}
            />
            <button type="button" onClick={checkEmail} disabled={checkingEmail} className={btnGhost}>
              {checkingEmail ? '확인...' : emailChecked === true ? '✓ 사용 가능' : emailChecked === false ? '✗ 중복' : '중복 확인'}
            </button>
          </Row>

          <Row label="비밀번호">
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상" required minLength={8} className={inputCls} />
          </Row>

          <Row label="휴대폰">
            <input
              id="phone" type="tel" inputMode="numeric" value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneVerified(false); setVerificationId(null); }}
              placeholder="01012345678" required maxLength={13} disabled={phoneVerified}
              className={`${inputCls} disabled:bg-[#f5f5f5]`}
            />
            <button type="button" onClick={sendCode} disabled={sendingSms || phoneVerified} className={btnGhost}>
              {sendingSms ? '발송...' : verificationId ? '재발송' : '인증번호 받기'}
            </button>
          </Row>

          {verificationId && !phoneVerified && (
            <Row label="인증번호">
              <input
                id="code" type="text" inputMode="numeric" value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6자리 숫자" maxLength={6}
                className={`${inputCls} tabular-nums`}
              />
              <button type="button" onClick={verifyCode} disabled={verifyingCode} className={btnNavy}>
                {verifyingCode ? '확인...' : '확인'}
              </button>
            </Row>
          )}

          {phoneVerified && (
            <div className="text-[12px] text-cyan font-bold pl-[80px]">✓ 폰 인증 완료</div>
          )}

          <Row label="네이버 ID">
            <input id="naver_id" type="text" value={naverId} onChange={(e) => setNaverId(e.target.value)} placeholder="예: rok22222 (@naver.com 앞부분만)" maxLength={50} className={inputCls} />
          </Row>
          <p className="text-[11px] text-muted leading-relaxed pl-[80px] -mt-1">
            ⓘ 카페 유료회원 인증용. 네이버 <b>로그인 아이디</b>만 (닉네임·풀주소 X).
          </p>

          <Row label="닉네임">
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="공개 닉네임 (실명 X)" required minLength={2} maxLength={20} className={inputCls} />
          </Row>

          <Row label="블로그/SNS">
            <input id="link_url" type="text" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://blog.naver.com/..." maxLength={500} className={inputCls} />
          </Row>
          <p className="text-[11px] text-muted leading-relaxed pl-[80px] -mt-1">
            다른 회원이 닉네임을 클릭하면 이 링크로 연결됩니다 (선택).
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

// 한 줄 row — 라벨 80px + input + (옵션) trailing 버튼
const inputCls = 'flex-1 min-w-0 border border-border px-3 py-2 text-[14px] outline-none focus:border-navy rounded-none';
const btnGhost = 'px-3 py-2 bg-white border border-border text-text text-[12px] font-bold whitespace-nowrap hover:border-navy disabled:opacity-50 cursor-pointer';
const btnNavy = 'px-3 py-2 bg-navy text-white text-[12px] font-bold whitespace-nowrap hover:bg-navy-dark disabled:opacity-50 cursor-pointer';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] flex-shrink-0 text-[12px] font-semibold text-muted">{label}</span>
      {children}
    </div>
  );
}
