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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setMsg(null);

    // 사용자가 풀 이메일을 입력해도 앞부분만 저장
    const cleanNaverId = naverId.trim().split('@')[0];
    // 한글 차단 — 네이버 ID는 항상 영문/숫자/언더바
    if (cleanNaverId && /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(cleanNaverId)) {
      setMsg({ type: 'error', text: '네이버 로그인 아이디에 한글을 넣을 수 없습니다.\n닉네임이 아니라 영문·숫자로 된 네이버 로그인 ID를 입력해주세요. (예: hodol9876)' });
      return;
    }
    // ASCII·숫자·언더바·하이픈만 (네이버 규칙)
    if (cleanNaverId && !/^[a-z0-9_-]+$/i.test(cleanNaverId)) {
      setMsg({ type: 'error', text: '네이버 로그인 아이디는 영문·숫자·_·- 만 가능합니다.' });
      return;
    }

    // 링크 정규화 — https:// 자동 보정, javascript: 차단
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

    // 닉네임·네이버ID 중복 사전 검사 (auth.users는 email unique 만 검사하므로)
    const nameT = name.trim();
    if (nameT) {
      const { data: dupName } = await supabase.from('profiles').select('id').eq('display_name', nameT).limit(1);
      if (dupName && dupName.length > 0) {
        setMsg({ type: 'error', text: `이미 사용 중인 닉네임입니다: "${nameT}". 다른 닉네임을 선택해주세요.` });
        return;
      }
    }
    if (cleanNaverId) {
      const { data: dupId } = await supabase.from('profiles').select('id').eq('naver_id', cleanNaverId).limit(1);
      if (dupId && dupId.length > 0) {
        setMsg({ type: 'error', text: `이미 가입된 네이버 ID입니다: "${cleanNaverId}". 본인 계정이라면 로그인해주세요.` });
        return;
      }
    }

    // 이메일 중복 사전 검사 — Supabase 는 미인증 상태 같은 이메일 재가입을 "성공" 처리해서
    // 사용자가 같은 이메일 여러 번 가입한 것처럼 보임. 서버 admin 으로 명확히 차단.
    const emailT = email.trim().toLowerCase();
    if (emailT) {
      const r = await fetch('/api/auth/check-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailT }),
      });
      const { exists } = (await r.json().catch(() => ({}))) as { exists?: boolean };
      if (exists) {
        setMsg({ type: 'error', text: `이미 가입된 이메일입니다: "${emailT}". 로그인 페이지에서 로그인해주세요.` });
        return;
      }
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name.trim(), naver_id: cleanNaverId || null, link_url: cleanLink, mlbg_signup: true },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({ type: 'info', text: '가입이 완료되었습니다.\n이메일로 발송된 인증 링크를 확인해주세요.' });
    setTimeout(() => router.push('/login'), 2500);
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
