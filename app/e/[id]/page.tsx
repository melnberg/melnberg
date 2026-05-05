'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import EmartPanel, { type EmartItem } from '@/components/EmartPanel';
import { createClient } from '@/lib/supabase/client';

export default function EmartDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [emart, setEmart] = useState<EmartItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const id = Number(params.id);

  async function load() {
    if (!Number.isFinite(id)) { setNotFound(true); setLoading(false); return; }
    const { data } = await supabase.rpc('list_emart_with_occupation').then((r) => r, () => ({ data: null }));
    const list = (data ?? []) as EmartItem[];
    const e = list.find((x) => Number(x.id) === id);
    if (!e) { setNotFound(true); setLoading(false); return; }
    setEmart(e); setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { label: emart?.name ?? '이마트', bold: true },
      ]} meta="Facility" />

      {loading && <div className="px-4 py-12 text-center text-[13px] text-muted">불러오는 중...</div>}
      {notFound && (
        <div className="py-24 text-center">
          <p className="text-[14px] text-muted mb-4">매장을 찾을 수 없습니다.</p>
          <Link href="/" className="text-[13px] font-bold text-navy no-underline hover:underline">← 피드로</Link>
        </div>
      )}
      {emart && (
        <div className="max-w-[680px] mx-auto w-full">
          <EmartPanel emart={emart} onClose={() => router.push('/')} onChanged={() => load()} inline />
        </div>
      )}
    </Layout>
  );
}
