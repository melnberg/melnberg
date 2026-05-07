'use client';

import { useEffect, useState, useRef } from 'react';
import StockInfoCard from './StockInfoCard';

type StockResult = { code: string; name: string; market?: string };

// 종목 검색 + 선택 + 정보 카드 미리보기.
// onPick 으로 선택 시 부모에 code 전달.
export default function StockPicker({ initial, onChange }: { initial?: string; onChange: (code: string | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<StockResult[]>([]);
  const [picked, setPicked] = useState<{ code: string; name: string } | null>(
    initial ? { code: initial, name: initial } : null,
  );
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/stock/search?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json();
        setResults(j.items ?? []);
        setOpen(true);
      } catch { setResults([]); }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  function pick(s: StockResult) {
    setPicked({ code: s.code, name: s.name });
    onChange(s.code);
    setQ('');
    setResults([]);
    setOpen(false);
  }

  function clearPick() {
    setPicked(null);
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      {!picked && (
        <div className="relative">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="종목명 또는 코드로 검색 (예: 삼성전자, 005930)"
            className="w-full border border-border px-3 py-2.5 text-[14px] outline-none focus:border-navy"
          />
          {open && results.length > 0 && (
            <ul className="absolute top-full left-0 right-0 z-10 mt-1 border border-border bg-white max-h-[280px] overflow-y-auto shadow-lg">
              {results.map((s) => (
                <li key={s.code}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                    className="w-full text-left px-3 py-2 hover:bg-cyan/5 border-b border-[#f0f0f0] last:border-b-0 bg-white cursor-pointer"
                  >
                    <span className="text-[13px] font-bold text-navy">{s.name}</span>
                    <span className="text-[11px] text-muted ml-2 tabular-nums">{s.code}</span>
                    {s.market && <span className="text-[10px] text-muted/70 ml-2">{s.market}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {picked && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-muted">선택된 종목</span>
            <button type="button" onClick={clearPick}
              className="text-[11px] text-red-500 hover:text-red-700 cursor-pointer bg-transparent border-none">
              ✕ 해제
            </button>
          </div>
          <StockInfoCard code={picked.code} />
        </div>
      )}
    </div>
  );
}
