import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { getCurrentUser } from '@/lib/auth';
import { createPublicClient } from '@/lib/supabase/public';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';

export const metadata = { title: '내 가게 — 멜른버그', description: '회원이 운영하는 실제 사업장 모음' };
export const dynamic = 'force-dynamic';

type AuthorInfo = { display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo: boolean | null; avatar_url: string | null };
type StoreRow = {
  id: number; author_id: string; name: string; category: string | null; description: string;
  recommended: string | null; address: string | null; dong: string | null;
  lat: number; lng: number; photo_url: string | null;
  contact: string | null; url: string | null;
  verified: boolean; like_count: number;
  created_at: string;
  author: AuthorInfo | null;
};

export default async function StoresIndex() {
  const user = await getCurrentUser();

  // 1) 가게 목록 — public client (anon) 로 조회. 쿠키 컨텍스트 없는 환경에서도 RLS 정책 (deleted_at IS NULL) 적용.
  // 조인 X — Supabase FK 추론 실패하던 사례 회피, 프로필은 별도 fetch.
  const pub = createPublicClient();
  const { data: rows, error } = await pub
    .from('my_stores')
    .select('id, author_id, name, category, description, recommended, address, dong, lat, lng, photo_url, contact, url, verified, like_count, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) console.error('my_stores select error:', error);

  const baseStores = (rows ?? []) as Omit<StoreRow, 'author'>[];

  // 2) 작성자 프로필 별도 fetch
  const authorIds = Array.from(new Set(baseStores.map((s) => s.author_id)));
  const authorMap = new Map<string, AuthorInfo>();
  if (authorIds.length > 0) {
    const { data: profs } = await pub
      .from('profiles')
      .select('id, display_name, link_url, tier, tier_expires_at, is_solo, avatar_url')
      .in('id', authorIds);
    for (const p of ((profs ?? []) as Array<AuthorInfo & { id: string }>)) {
      authorMap.set(p.id, p);
    }
  }

  const stores: StoreRow[] = baseStores.map((s) => ({ ...s, author: authorMap.get(s.author_id) ?? null }));

  // 본인 가게 1개 — 등록 버튼 분기
  const myStore = user ? stores.find((s) => s.author_id === user.id) ?? null : null;

  return (
    <Layout current="stores">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/stores', label: '내 가게', bold: true }]} meta="My Stores" />

      <section className="pt-8 lg:pt-14 pb-2">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          <div className="flex items-center justify-between gap-4 pb-3 border-b-2 border-cyan flex-wrap">
            <div>
              <h1 className="text-[24px] lg:text-[32px] font-bold text-navy tracking-tight">🏪 내 가게</h1>
              <p className="text-[12px] text-muted mt-1">회원이 직접 운영하는 실제 사업장. 1인 1개 · 사업자 진위 확인 필수.</p>
            </div>
            {user && (
              myStore ? (
                <Link href={`/stores/${myStore.id}`}
                  className="border-2 border-cyan text-navy px-4 py-2 text-[12px] font-bold no-underline hover:bg-cyan/10 flex-shrink-0">
                  내 가게 보기 →
                </Link>
              ) : (
                <Link href="/stores/new"
                  className="bg-cyan text-navy px-5 py-2.5 text-[13px] font-bold no-underline hover:bg-cyan/80 flex-shrink-0">
                  내 가게 등록 →
                </Link>
              )
            )}
          </div>
        </div>
      </section>

      <section className="py-6">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          {stores.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted text-[15px] mb-6">아직 등록된 가게가 없어요.</p>
              {user && !myStore && (
                <Link href="/stores/new" className="inline-block bg-cyan text-navy px-6 py-3 text-[13px] font-bold no-underline hover:bg-cyan/80">첫 가게 등록 (+30 mlbg)</Link>
              )}
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {stores.map((s) => (
                <li key={s.id}>
                  <Link href={`/stores/${s.id}`}
                    className="block bg-white border border-border hover:border-navy hover:bg-bg/30 no-underline overflow-hidden">
                    {s.photo_url ? (
                      <div className="aspect-square w-full bg-[#f0f0f0] overflow-hidden">
                        <img src={s.photo_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-square w-full bg-bg/40 flex items-center justify-center text-[64px]">🏪</div>
                    )}
                    <div className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <h3 className="text-[15px] font-bold text-navy truncate inline-flex items-center gap-1.5">
                          🏪 <span className="truncate">{s.dong ? `${s.dong} ${s.name}` : s.name}</span>
                        </h3>
                        <span className="text-[10px] text-muted flex-shrink-0">❤ {s.like_count}</span>
                      </div>
                      {s.address && <div className="text-[10px] text-muted mb-1 truncate">{s.address}</div>}
                      <p className="text-[12px] text-text leading-snug line-clamp-2 mb-1">{s.description}</p>
                      {s.recommended && (
                        <p className="text-[11px] text-cyan font-bold leading-snug line-clamp-1">메뉴/서비스 — {s.recommended}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#f0f0f0] text-[10px] text-muted">
                        <span className="inline-flex items-center gap-1.5 truncate">
                          by <Nickname info={profileToNicknameInfo(s.author, s.author_id)} />
                        </span>
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          {s.category && <span>{s.category}</span>}
                          {s.verified && <span className="text-[9px] font-bold tracking-wider uppercase bg-cyan text-white px-1.5 py-0.5">✓ 인증</span>}
                        </span>
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
