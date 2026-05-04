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
  const [name, setName] = useState('');
  const [naverId, setNaverId] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [emailFormOpen, setEmailFormOpen] = useState(false);

  // 이메일 중복 확인
  const [emailChecked, setEmailChecked] = useState<boolean | null>(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setMsg(null);

    if (emailChecked !== true) {
      setMsg({ type: 'error', text: '이메일 중복 확인을 먼저 해주세요.' });
      return;
    }

    const cleanNaverId = naverId.trim().split('@')[0];
    if (cleanNaverId && /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(cleanNaverId)) {
      setMsg({ type: 'error', text: '네이버 ID에 한글을 넣을 수 없습니다.' });
      return;
    }
    if (cleanNaverId && !/^[a-z0-9_-]+$/i.test(cleanNaverId)) {
      setMsg({ type: 'error', text: '네이버 ID는 영문·숫자·_·- 만 가능합니다.' });
      return;
    }

    let cleanLink: string | null = null;
    const rawLink = linkUrl.trim();
    if (rawLink) {
      if (/^javascript:/i.test(rawLink)) { setMsg({ type: 'error', text: '잘못된 링크 형식입니다.' }); return; }
      cleanLink = /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;
      if (cleanLink.length > 500) { setMsg({ type: 'error', text: '링크가 너무 깁니다 (500자 초과).' }); return; }
    }

    const nameT = name.trim();
    if (nameT) {
      const { data: dupName } = await supabase.from('profiles').select('id').eq('display_name', nameT).limit(1);
      if (dupName && dupName.length > 0) {
        setMsg({ type: 'error', text: `이미 사용 중인 닉네임입니다: "${nameT}"` });
        return;
      }
    }
    if (cleanNaverId) {
      const { data: dupId } = await supabase.from('profiles').select('id').eq('naver_id', cleanNaverId).limit(1);
      if (dupId && dupId.length > 0) {
        setMsg({ type: 'error', text: `이미 가입된 네이버 ID입니다: "${cleanNaverId}"` });
        return;
      }
    }

    setLoading(true);
    // Supabase 기본 이메일 인증 흐름 — 인증 메일 발송, 사용자가 메일 링크 클릭하면 가입 완료
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { display_name: nameT, naver_id: cleanNaverId || null, link_url: cleanLink, mlbg_signup: true },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({ type: 'info', text: '가입이 완료되었습니다.\n이메일로 발송된 인증 링크를 클릭해주세요.' });
    setTimeout(() => router.push('/login'), 3000);
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

const inputCls = 'flex-1 min-w-0 border border-border px-3 py-2 text-[14px] outline-none focus:border-navy rounded-none';
const btnGhost = 'px-3 py-2 bg-white border border-border text-text text-[12px] font-bold whitespace-nowrap hover:border-navy disabled:opacity-50 cursor-pointer';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] flex-shrink-0 text-[12px] font-semibold text-muted">{label}</span>
      {children}
    </div>
  );
}
