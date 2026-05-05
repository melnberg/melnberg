'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AptDiscussionPanel from '@/components/AptDiscussionPanel';
import { type AptPin } from '@/components/AptMap';
import { createClient } from '@/lib/supabase/client';

export default function AptDetailClient({ id }: { id: number }) {
  const router = useRouter();
  const supabase = createClient();
  const [apt, setApt] = useState<AptPin | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Number.isFinite(id) || id <= 0) { setNotFound(true); setLoading(false); return; }
      // apt_master_with_listing 뷰 — listing_price/pyeong_price 포함
      const { data } = await supabase
        .from('apt_master_with_listing')
        .select('id, apt_nm, dong, lawd_cd, lat, lng, household_count, building_count, kapt_build_year, geocoded_address, occupier_id, occupied_at, listing_price, pyeong_price')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setNotFound(true); setLoading(false); return; }
      setApt(data as unknown as AptPin); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, supabase]);

  if (loading) return <div className="px-4 py-12 text-center text-[13px] text-muted">불러오는 중...</div>;
  if (notFound) return (
    <div className="py-24 text-center">
      <p className="text-[14px] text-muted mb-4">단지를 찾을 수 없습니다.</p>
      <Link href="/" className="text-[13px] font-bold text-navy no-underline hover:underline">← 피드로</Link>
    </div>
  );
  if (!apt) return null;
  return (
    <div className="max-w-[680px] mx-auto w-full">
      <AptDiscussionPanel apt={apt} onClose={() => router.push('/')} inline />
    </div>
  );
}
