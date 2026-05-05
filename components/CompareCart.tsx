'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getCart, removeFromCart, clearCart, COMPARE_CART_EVENT, MAX_COMPARE_ITEMS, type CompareItem } from '@/lib/compare-cart';

export default function CompareCart() {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    function refresh() {
      setItems(getCart());
    }
    refresh();
    window.addEventListener(COMPARE_CART_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(COMPARE_CART_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (items.length === 0) return null;
  const compareUrl = `/compare?ids=${items.map((i) => i.id).join(',')}`;
  const canCompare = items.length >= 2;

  return (
    <div className="fixed bottom-4 right-4 z-40 bg-white border border-navy shadow-[0_4px_20px_rgba(0,0,0,0.18)] w-[280px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 bg-navy text-white text-[12px] font-bold tracking-wide cursor-pointer border-none"
      >
        <span>비교 카트 ({items.length}/{MAX_COMPARE_ITEMS})</span>
        <span className="text-[10px]">{open ? '접기' : '펼치기'}</span>
      </button>
      {open && (
        <div>
          <ul className="max-h-[200px] overflow-y-auto">
            {items.map((it) => (
              <li key={it.id} className="px-3 py-2 border-b border-border last:border-b-0 flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate text-text font-medium">{it.apt_nm}</span>
                <button
                  type="button"
                  onClick={() => removeFromCart(it.id)}
                  className="text-muted hover:text-red-600 text-[11px] bg-transparent border-none p-0 cursor-pointer flex-shrink-0"
                >
                  제거
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-1 p-2 border-t border-border">
            <Link
              href={compareUrl}
              aria-disabled={!canCompare}
              onClick={(e) => { if (!canCompare) e.preventDefault(); }}
              className={`flex-1 text-center px-3 py-1.5 text-[12px] font-bold tracking-wide no-underline ${canCompare ? 'bg-navy text-white hover:bg-navy-dark' : 'bg-muted/30 text-muted pointer-events-none'}`}
            >
              비교하기 {!canCompare && '(2개 이상)'}
            </Link>
            <button
              type="button"
              onClick={() => clearCart()}
              className="px-3 py-1.5 text-[12px] text-muted hover:text-red-600 bg-white border border-border cursor-pointer"
            >
              비우기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
