'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function FindAccountForm() {
  const [tab, setTab] = useState<'id' | 'pw'>('id');
  return (
    <div>
      <div className="flex gap-1 border-b border-border mb-6">
        <button
          type="button"
          onClick={() => setTab('id')}
          className={`px-5 py-2.5 text-[13px] font-bold tracking-wide -mb-px ${tab === 'id' ? 'border-b-2 border-navy text-navy' : 'text-muted hover:text-navy'}`}
        >아이디(이메일) 찾기</button>
        <button
          type="button"
          onClick={() => setTab('pw')}
          className={`px-5 py-2.5 text-[13px] font-bold tracking-wide -mb-px ${tab === 'pw' ? 'border-b-2 border-navy text-navy' : 'text-muted hover:text-navy'}`}
        >비밀번호 재설정</button>
      </div>
      {tab === 'id' ? <FindIdTab /> : <ResetPwTab />}
      <p className="text-[11px] text-muted text-center mt-8">
        <Link href="/login" className="text-navy hover:underline no-underline">로그인으로 돌아가기</Link>
      </p>
    </div>
  );
}

function FindIdTab() {
  const [naverId, setNaverId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ found: boolean; emails?: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    if (!naverId.trim() && !displayName.trim()) {
      setErr('네이버 ID 또는 닉네임을 입력해주세요.');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/find-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naverId: naverId.trim(), displayName: displayName.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      setErr(error ?? `오류: ${res.status}`);
      return;
    }
    setResult(await res.json());
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[12px] text-muted leading-relaxed">
        가입 시 입력한 네이버 ID 또는 닉네임으로 가입 이메일을 찾을 수 있습니다.
      </p>
      <Field label="네이버 로그인 아이디" id="naver" value={naverId} onChange={setNaverId} placeholder="예: rok22222" />
      <div className="text-center text-[11px] text-muted">— 또는 —</div>
      <Field label="닉네임" id="nick" value={displayName} onChange={setDisplayName} placeholder="가입 시 사용한 닉네임" />
      <button
        type="submit"
        disabled={busy}
        className="bg-navy text-white border-none px-6 py-3 text-[13px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-50"
      >{busy ? '조회 중...' : '이메일 찾기'}</button>
      {err && <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 px-3 py-2">{err}</div>}
      {result && !result.found && (
        <div className="text-[12px] text-text bg-navy-soft px-3 py-2.5 leading-relaxed">
          일치하는 회원을 찾지 못했습니다. 입력한 정보를 다시 확인해주세요.
        </div>
      )}
      {result && result.found && result.emails && (
        <div className="text-[12px] text-text bg-cyan/15 border border-cyan px-4 py-3 leading-relaxed">
          가입 이메일:
          <ul className="mt-1 list-disc list-inside font-mono text-[13px]">
            {result.emails.map((e) => <li key={e}>{e}</li>)}
          </ul>
          <div className="text-[11px] text-muted mt-2">보안을 위해 일부 마스킹됨. 본인 이메일이 떠오르면 로그인하세요.</div>
        </div>
      )}
    </form>
  );
}

function ResetPwTab() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const supabase = createClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setMsg({ type: 'err', text: '이메일을 입력해주세요.' }); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    setMsg({ type: 'ok', text: '재설정 안내 메일을 발송했습니다.\n메일 본문의 링크를 클릭해 새 비밀번호를 설정해주세요.' });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[12px] text-muted leading-relaxed">
        가입 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.
      </p>
      <Field label="이메일" id="email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
      <button
        type="submit"
        disabled={busy}
        className="bg-navy text-white border-none px-6 py-3 text-[13px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-50"
      >{busy ? '발송 중...' : '재설정 링크 받기'}</button>
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
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none"
      />
    </div>
  );
}
