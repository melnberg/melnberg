'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import FactoryPanel, { type FactoryItem } from '@/components/FactoryPanel';
import { createClient } from '@/lib/supabase/client';

export default function FactoryDetailClient({ id }: { id: number }) {
  const router = useRouter();
  const supabase = createClient();
  const [factory, setFactory] = useState<FactoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  async function load() {
    if (!Number.isFinite(id) || id <= 0) { setNotFound(true); setLoading(false); return; }
    const { data } = await supabase.rpc('list_factory_with_occupation').then((r) => r, () => ({ data: null }));
    const list = (data ?? []) as FactoryItem[];
    const f = list.find((x) => Number(x.id) === id);
    if (!f) { setNotFound(true); setLoading(false); return; }
    setFactory(f); setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (loading) return <div className="px-4 py-12 text-center text-[13px] text-muted">불러오는 중...</div>;
  if (notFound) return (
    <div className="py-24 text-center">
      <p className="text-[14px] text-muted mb-4">시설을 찾을 수 없습니다.</p>
      <Link href="/" className="text-[13px] font-bold text-navy no-underline hover:underline">← 피드로</Link>
    </div>
  );
  if (!factory) return null;
  return (
    <div className="max-w-[680px] mx-auto w-full">
      <FactoryPanel factory={factory} onClose={() => router.back()} onChanged={() => load()} inline />
    </div>
  );
}
