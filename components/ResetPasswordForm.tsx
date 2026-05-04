'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [ready, setReady] = useState(false); // recovery 세션 진입 여부

  useEffect(() => {
    // Supabase가 magic link 클릭 후 access_token을 hash 또는 코드로 전달
    // PASSWORD_RECOVERY 이벤트가 발생하면 ready
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    // 페이지 로드 시점에 이미 세션이 있으면 ready
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setReady(true); });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pw1.length < 8) { setMsg({ type: 'err', text: '비밀번호는 8자 이상이어야 합니다.' }); return; }
    if (pw1 !== pw2) { setMsg({ type: 'err', text: '비밀번호가 일치하지 않습니다.' }); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    setMsg({ type: 'ok', text: '비밀번호가 변경되었습니다.\n로그인 페이지로 이동합니다.' });
    setTimeout(() => router.push('/login'), 1800);
  }

  if (!ready) {
    return (
      <div className="text-[13px] text-text bg-navy-soft border border-border px-4 py-4 leading-relaxed">
        재설정 링크를 통해 들어와야 합니다. 만료됐거나 잘못된 링크라면 다시 발송해주세요.
        <div className="mt-3">
          <Link href="/find-account" className="inline-block bg-navy text-white px-4 py-2 text-[12px] font-bold no-underline hover:bg-navy-dark">
            재설정 링크 다시 받기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="새 비밀번호" id="pw1" type="password" value={pw1} onChange={setPw1} placeholder="8자 이상" />
      <Field label="새 비밀번호 확인" id="pw2" type="password" value={pw2} onChange={setPw2} placeholder="다시 입력" />
      <button
        type="submit"
        disabled={busy}
        className="bg-navy text-white border-none px-6 py-3 text-[13px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-50"
      >{busy ? '변경 중...' : '비밀번호 변경'}</button>
      {msg && (
        <div className={`text-[12px] px-3 py-2.5 leading-relaxed whitespace-pre-line ${msg.type === 'err' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-cyan/15 text-text border border-cyan'}`}>
          {msg.text}
        </div>
      )}
    </form>
  );
}

function Field({ label, id, value, onChange, type = 'text', placeholder }: {
  label: string; id: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-bold tracking-widest uppercase text-muted">{label}</label>
      <input
        id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none"
      />
    </div>
  );
}
