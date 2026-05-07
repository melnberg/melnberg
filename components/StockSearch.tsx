'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Stock } from '@/lib/stocks';

// 종목 목록 + 클라이언트 사이드 검색 (이름·코드).
export default function StockSearch({ stocks }: { stocks: Stock[] }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return stocks;
    return stocks.filter((s) => s.name.toLowerCase().includes(t) || s.code.includes(t));
  }, [q, stocks]);

  const grouped = useMemo(() => {
    const k: Stock[] = [];
    const q: Stock[] = [];
    for (const s of filtered) (s.market === 'KOSPI' ? k : q).push(s);
    return { KOSPI: k, KOSDAQ: q };
  }, [filtered]);

  return (
    <div>
      <div className="mb-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="종목명 또는 코드 검색 (예: 삼성전자, 005930)"
          className="w-full max-w-md px-3 py-2.5 border border-border focus:border-navy text-[14px] outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] text-muted py-12 text-center">검색 결과가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(['KOSPI', 'KOSDAQ'] as const).map((m) => (
            grouped[m].length === 0 ? null : (
              <div key={m}>
                <div className="text-[11px] font-bold tracking-widest uppercase text-muted mb-2">{m}</div>
                <ul className="border-y border-border">
                  {grouped[m].map((s) => (
                    <li key={s.code} className="border-b border-[#f0f0f0] last:border-b-0">
                      <Link
                        href={`/stocks/${s.code}`}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-cyan/5 no-underline"
                      >
                        <span className="text-[14px] font-bold text-navy">{s.name}</span>
                        <span className="text-[11px] text-muted tabular-nums">{s.code}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}
