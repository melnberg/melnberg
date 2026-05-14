import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { StadiumIcon } from '@/components/CategoryIcons';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata = { title: '경기장·운동장 추천 — 멜른버그' };
export const dynamic = 'force-dynamic';

type Pin = {
  id: number; name: string; description: string; recommended_activity: string;
  lat: number; lng: number; photo_url: string | null; address: string | null;
  dong: string | null;
  occupy_price: number; daily_income: number; like_count: number;
  author_id: string; author_name: string | null;
  occupier_id: string | null; occupier_name: string | null;
  listing_price: number | null; created_at: string;
};

export default async function StadiumsPage() {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc('list_recent_stadium_pins', { p_limit: 500 }).then((r) => r, () => ({ data: null }));
  const pins = (data ?? []) as Pin[];

  return (
    <Layout current="stadiums">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/stadiums', label: '경기장·운동장', bold: true }]} meta="Stadium" />
      <section className="py-6 sm:py-12">
        <div className="max-w-content mx-auto px-4 sm:px-10">
          <div className="flex items-center justify-between gap-4 mb-2">
            <h1 className="text-[28px] font-bold text-navy tracking-tight inline-flex items-center gap-2"><StadiumIcon className="w-[26px] h-[26px]" /> 경기장·운동장 추천</h1>
            <Link href="/stadiums/new" className="bg-navy text-white px-4 py-2 text-[12px] font-bold no-underline hover:bg-navy-dark whitespace-nowrap">+ 경기장 등록</Link>
          </div>
          <p className="text-sm text-muted mb-6">스포츠 경기·운동 가능한 장소 정보 공유. 등록 시 +30 mlbg / 분양 100 / 일 수익 1.</p>
          {pins.length === 0 ? (
            <div className="text-[13px] text-muted text-center py-16 border border-border">아직 등록된 경기장이 없어요.</div>
          ) : (
            <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 max-w-[400px] sm:max-w-[820px] mx-auto">
              {pins.map((p) => (
                <li key={p.id}>
                  <Link href={`/stadiums/${p.id}`} className="block bg-white border border-border hover:border-navy hover:bg-bg/30 no-underline overflow-hidden">
                    {p.photo_url && (
                      <div
                        className="w-full bg-[#f0f0f0] overflow-hidden"
                        style={{ aspectRatio: '1 / 1' }}
                      >
                        <img src={p.photo_url} alt="" className="w-full h-full object-cover block" />
                      </div>
                    )}
                    <div className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <h3 className="text-[15px] font-bold text-navy truncate inline-flex items-center gap-1.5"><StadiumIcon className="w-[14px] h-[14px]" /> <span className="truncate">{p.dong ? `${p.dong} ${p.name}` : p.name}</span></h3>
                        <span className="text-[10px] text-muted flex-shrink-0">❤ {p.like_count}</span>
                      </div>
                      {p.address && <div className="text-[10px] text-muted mb-1">{p.address}</div>}
                      <p className="text-[12px] text-text leading-snug line-clamp-2 mb-1">{p.description}</p>
                      <p className="text-[11px] text-[#3b82f6] font-bold leading-snug line-clamp-1">종목 — {p.recommended_activity}</p>
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#f0f0f0] text-[10px] text-muted">
                        <span>by {p.author_name ?? '익명'}</span>
                        {p.occupier_id ? <span className="text-[#92400e] font-bold">분양 완료 — {p.occupier_name ?? '익명'}</span>
                          : <span className="text-cyan font-bold">분양 가능 ({Number(p.occupy_price).toLocaleString()} mlbg)</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Layout>
  );
}
