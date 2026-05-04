'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Apt = {
  id: number;
  apt_nm: string;
  dong: string | null;
  household_count: number | null;
  building_count: number | null;
  kapt_build_year: number | null;
  geocoded_address: string | null;
  geocoded_place_name: string | null;
};

type Filter = 'null' | 'tiny' | 'search';
const PAGE_SIZE = 50;

export default function AptMasterAdmin({ nullCount, tinyCount }: { nullCount: number; tinyCount: number }) {
  const supabase = createClient();
  const [filter, setFilter] = useState<Filter>('null');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Apt[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Map<number, { apt_nm?: string; household_count?: number | null }>>(new Map());

  async function load() {
    setLoading(true);
    let q = supabase
      .from('apt_master')
      .select('id, apt_nm, dong, household_count, building_count, kapt_build_year, geocoded_address, geocoded_place_name')
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (filter === 'null') q = q.is('household_count', null);
    else if (filter === 'tiny') q = q.lt('household_count', 50);
    else if (filter === 'search' && search.trim()) {
      q = q.or(`apt_nm.ilike.%${search.trim()}%,geocoded_place_name.ilike.%${search.trim()}%`);
    }

    const { data } = await q;
    setRows((data ?? []) as Apt[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search, page]);

  function setEdit(id: number, field: 'apt_nm' | 'household_count', value: string) {
    setEdits((prev) => {
      const m = new Map(prev);
      const cur = m.get(id) ?? {};
      if (field === 'apt_nm') {
        m.set(id, { ...cur, apt_nm: value });
      } else {
        const n = value.trim() === '' ? null : Number(value);
        m.set(id, { ...cur, household_count: Number.isFinite(n as number) ? n : null });
      }
      return m;
    });
  }

  async function saveRow(id: number) {
    const e = edits.get(id);
    if (!e) return;
    setSavingId(id);
    const update: Record<string, unknown> = {};
    if (e.apt_nm !== undefined) update.apt_nm = e.apt_nm.trim();
    if (e.household_count !== undefined) update.household_count = e.household_count;
    const { error } = await supabase.from('apt_master').update(update).eq('id', id);
    setSavingId(null);
    if (error) { alert(error.message); return; }
    // 저장 성공 → 로컬 row 갱신, edits에서 제거
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...update } as Apt : r)));
    setEdits((prev) => { const m = new Map(prev); m.delete(id); return m; });
  }

  function changeFilter(f: Filter) {
    setFilter(f);
    setPage(0);
    if (f !== 'search') setSearch('');
  }

  return (
    <div className="space-y-5">
      {/* 필터 탭 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => changeFilter('null')}
          className={`px-4 py-2 text-[12px] font-bold border ${filter === 'null' ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-border hover:border-navy'}`}
        >
          세대수 NULL ({nullCount.toLocaleString()})
        </button>
        <button
          type="button"
          onClick={() => changeFilter('tiny')}
          className={`px-4 py-2 text-[12px] font-bold border ${filter === 'tiny' ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-border hover:border-navy'}`}
        >
          &lt;50세대 ({tinyCount.toLocaleString()})
        </button>
        <form
          onSubmit={(e) => { e.preventDefault(); changeFilter('search'); setSearch(searchInput); }}
          className="flex gap-2 ml-auto"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="단지명·동 검색"
            className="border border-border px-3 py-2 text-[12px] w-56 focus:outline-none focus:border-navy"
          />
          <button type="submit" className="px-4 py-2 text-[12px] font-bold border border-navy text-navy hover:bg-navy hover:text-white">
            검색
          </button>
        </form>
      </div>

      {/* 헤더 */}
      <div className="grid grid-cols-[60px_1fr_120px_1fr_100px_70px_80px_70px] gap-3 px-3 py-2 text-[11px] font-bold text-navy bg-navy-soft border-b border-navy">
        <div>ID</div>
        <div>단지명 (편집 가능)</div>
        <div>동</div>
        <div className="truncate">주소 / Kakao 이름</div>
        <div className="text-center">세대수</div>
        <div className="text-center">동수</div>
        <div className="text-center">준공년도</div>
        <div className="text-center">저장</div>
      </div>

      {loading && <div className="py-12 text-center text-sm text-muted">불러오는 중...</div>}
      {!loading && rows.length === 0 && <div className="py-12 text-center text-sm text-muted">결과 없음</div>}

      {!loading && rows.map((r) => {
        const edit = edits.get(r.id);
        const isDirty = !!edit;
        const aptNmVal = edit?.apt_nm ?? r.apt_nm;
        const hhVal = edit?.household_count !== undefined ? (edit.household_count ?? '') : (r.household_count ?? '');
        return (
          <div key={r.id} className={`grid grid-cols-[60px_1fr_120px_1fr_100px_70px_80px_70px] gap-3 px-3 py-2 items-center text-[12px] border-b border-[#f0f0f0] ${isDirty ? 'bg-amber-50' : 'bg-white'}`}>
            <div className="text-muted tabular-nums">{r.id}</div>
            <div>
              <input
                type="text"
                value={aptNmVal}
                onChange={(e) => setEdit(r.id, 'apt_nm', e.target.value)}
                className="w-full border border-border px-2 py-1 text-[12px] focus:outline-none focus:border-navy bg-white"
              />
            </div>
            <div className="text-text truncate">{r.dong ?? '—'}</div>
            <div className="text-[11px] text-muted truncate" title={`${r.geocoded_address ?? ''} / ${r.geocoded_place_name ?? ''}`}>
              {r.geocoded_place_name && r.geocoded_place_name !== r.apt_nm && (
                <span className="text-cyan font-bold">[{r.geocoded_place_name}]</span>
              )}{' '}
              {r.geocoded_address ?? ''}
            </div>
            <div>
              <input
                type="number"
                value={hhVal}
                onChange={(e) => setEdit(r.id, 'household_count', e.target.value)}
                placeholder="—"
                className="w-full border border-border px-2 py-1 text-[12px] text-right tabular-nums focus:outline-none focus:border-navy bg-white"
              />
            </div>
            <div className="text-center text-muted tabular-nums">{r.building_count ?? '—'}</div>
            <div className="text-center text-muted tabular-nums">{r.kapt_build_year ?? '—'}</div>
            <div className="text-center">
              <button
                type="button"
                onClick={() => saveRow(r.id)}
                disabled={!isDirty || savingId === r.id}
                className="px-3 py-1 text-[11px] font-bold bg-navy text-white hover:bg-navy-dark disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {savingId === r.id ? '...' : '저장'}
              </button>
            </div>
          </div>
        );
      })}

      {/* 페이지네이션 */}
      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between pt-4">
          <div className="text-[11px] text-muted">페이지 {page + 1} · {rows.length}건</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-[11px] font-bold border border-border text-navy hover:border-navy disabled:opacity-30"
            >
              ← 이전
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={rows.length < PAGE_SIZE}
              className="px-3 py-1.5 text-[11px] font-bold border border-border text-navy hover:border-navy disabled:opacity-30"
            >
              다음 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
