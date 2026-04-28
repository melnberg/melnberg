'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/me';

  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="이메일" id="email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
      <Field label="비밀번호" id="password" type="password" value={password} onChange={setPassword} required />

      {msg && (
        <div className={`text-sm px-4 py-3 ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-navy text-white'}`}>
          {msg.text}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="bg-navy text-white border-none px-6 py-3.5 text-[13px] font-bold tracking-wider uppercase cursor-pointer mt-2 hover:bg-navy-dark disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '로그인 중...' : '로그인 →'}
      </button>

      <p className="text-sm text-muted text-center mt-6">
        계정이 없나요?{' '}
        <Link href="/signup" className="text-navy font-semibold no-underline hover:underline">회원가입</Link>
      </p>
    </form>
  );
}

function Field({
  label, id, value, onChange, type = 'text', placeholder, required,
}: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
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
        className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none"
      />
    </div>
  );
}
