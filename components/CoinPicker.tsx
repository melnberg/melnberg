'use client';

import { useEffect, useState, useRef } from 'react';
import StockInfoCard from './StockInfoCard';

type CoinResult = { code: string; name: string; english: string };

// 코인 검색 + 선택 + 정보 카드 미리보기. /api/coin/info 가 StockInfo 와 호환되는 응답을 줘서
// StockInfoCard 를 그대로 재사용 — 단, code 가 'KRW-BTC' 형식이라 카드 내부 fetch 경로 분기 필요.
export default function CoinPicker({ initial, initialName, onChange }: { initial?: string; initialName?: string; onChange: (code: string | null, name: string | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CoinResult[]>([]);
  const [picked, setPicked] = useState<{ code: string; name: string } | null>(
    initial ? { code: initial, name: initialName ?? initial } : null,
  );
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/coin/search?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json();
        setResults(j.items ?? []);
        setOpen(true);
      } catch { setResults([]); }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  function pick(s: CoinResult) {
    setPicked({ code: s.code, name: s.name });
    onChange(s.code, s.name);
    setQ('');
    setResults([]);
    setOpen(false);
  }

  function clearPick() {
    setPicked(null);
    onChange(null, null);
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
            placeholder="코인명 또는 심볼 (예: 비트코인, BTC, 이더리움)"
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
                    <span className="text-[11px] text-muted ml-2">{s.code.replace('KRW-', '')}</span>
                    <span className="text-[10px] text-muted/70 ml-2">{s.english}</span>
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
            <span className="text-[12px] text-muted">선택된 코인</span>
            <button type="button" onClick={clearPick}
              className="text-[11px] text-red-500 hover:text-red-700 cursor-pointer bg-transparent border-none">
              ✕ 해제
            </button>
          </div>
          <StockInfoCard code={picked.code} kind="coin" />
        </div>
      )}
    </div>
  );
}
