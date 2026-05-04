'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import OAuthButtons from './OAuthButtons';

// 통합 가입 흐름:
// 1) 이메일/비번 입력 → Supabase 인증 메일 발송
// 2) 사용자가 메일 링크 클릭 → /auth/callback → 세션 생성
// 3) /auth/callback 이 profile_completed_at = NULL 감지 → /complete-signup 으로 우회
// 4) /complete-signup 에서 닉네임·네이버ID·폰·블로그 입력 → 완료
// OAuth(카카오/구글) 도 동일하게 /complete-signup 거침. 단일 폼 단일 검증.

export default function SignupForm() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [emailFormOpen, setEmailFormOpen] = useState(false);

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
    if (password.length < 8) {
      setMsg({ type: 'error', text: '비밀번호는 8자 이상이어야 합니다.' });
      return;
    }

    setLoading(true);
    // mlbg_signup 마커 안 보냄 → profile_completed_at NULL → 인증 후 /complete-signup 강제
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/complete-signup')}`,
      },
    });

    setLoading(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({ type: 'info', text: '인증 메일이 발송되었습니다.\n메일함에서 링크를 클릭해주세요.\n(클릭하면 닉네임·휴대폰 등 추가 정보 입력 페이지로 이동합니다.)' });
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
              onChange={(ev) => { setEmail(ev.target.value); setEmailChecked(null); }}
              placeholder="you@example.com" required
              className={inputCls}
            />
            <button type="button" onClick={checkEmail} disabled={checkingEmail} className={btnGhost}>
              {checkingEmail ? '확인...' : emailChecked === true ? '✓ 사용 가능' : emailChecked === false ? '✗ 중복' : '중복 확인'}
            </button>
          </Row>

          <Row label="비밀번호">
            <input id="password" type="password" value={password} onChange={(ev) => setPassword(ev.target.value)} placeholder="8자 이상" required minLength={8} className={inputCls} />
          </Row>

          <p className="text-[11px] text-muted leading-relaxed pl-[80px]">
            ⓘ 가입 후 메일 인증 → 닉네임·휴대폰 등 추가 정보 입력 단계가 이어집니다.
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
            {loading ? '가입 중...' : '인증 메일 보내기 →'}
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
