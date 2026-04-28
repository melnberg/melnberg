'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="bg-white border border-border text-text px-5 py-2.5 text-[13px] font-semibold tracking-wide cursor-pointer hover:border-navy hover:text-navy disabled:opacity-50"
    >
      {loading ? '로그아웃 중...' : '로그아웃'}
    </button>
  );
}
