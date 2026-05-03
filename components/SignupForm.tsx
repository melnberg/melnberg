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
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name, naver_id: naverId.trim() || null },
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
      <Field label="네이버 아이디 (멜른버그 카페)" id="naver_id" value={naverId} onChange={setNaverId} placeholder="카페 유료회원이면 자동 인식됨 (선택)" maxLength={50} />
      <p className="text-[11px] text-muted leading-relaxed -mt-2 px-0.5">
        ⓘ 카페 유료회원 자동 인식: <b>네이버 아이디 + 닉네임</b> 둘 다 카페 정보와 정확히 일치해야 합니다.
        닉네임은 카페에서 쓰는 별명을 그대로 입력하세요.
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
