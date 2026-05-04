'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SignupForm() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [naverId, setNaverId] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

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

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name.trim(), naver_id: cleanNaverId || null },
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="닉네임" id="name" value={name} onChange={setName} placeholder="공개 닉네임 (실명 X)" required minLength={2} maxLength={20} />
      <Field label="네이버 로그인 아이디 (닉네임·이메일 아님)" id="naver_id" value={naverId} onChange={setNaverId} placeholder="예: rok22222 (@naver.com 앞부분만)" maxLength={50} />
      <p className="text-[11px] text-muted leading-relaxed -mt-2 px-0.5">
        ⓘ 카페 유료회원 자동 인식: 네이버 <b>로그인 아이디</b>와 카페 닉네임이 명부와 일치해야 합니다.
        ✗ 닉네임/이메일 풀주소 입력 금지. <code>jiroclinic@naver.com</code>이면 <b>jiroclinic</b>만.
      </p>
      <Field label="이메일" id="email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
      <Field label="비밀번호" id="password" type="password" value={password} onChange={setPassword} placeholder="8자 이상" required minLength={8} />

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

      <p className="text-sm text-muted text-center mt-6">
        이미 계정이 있나요?{' '}
        <Link href="/login" className="text-navy font-semibold no-underline hover:underline">로그인</Link>
      </p>
    </form>
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
