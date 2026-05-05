// 단지 비교 카트 — localStorage 기반, 다른 탭/컴포넌트와 이벤트 동기화.

export type CompareItem = { id: number; apt_nm: string };

const KEY = 'mlbg_compare_cart_v1';
const MAX = 4;
const EVENT = 'mlbg-compare-cart-changed';

export function getCart(): CompareItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CompareItem[]) : [];
  } catch {
    return [];
  }
}

function persist(items: CompareItem[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(item: CompareItem): { ok: boolean; reason?: string } {
  const cart = getCart();
  if (cart.find((c) => c.id === item.id)) return { ok: false, reason: '이미 담김' };
  if (cart.length >= MAX) return { ok: false, reason: `최대 ${MAX}개까지` };
  persist([...cart, item]);
  return { ok: true };
}

export function removeFromCart(id: number): void {
  persist(getCart().filter((c) => c.id !== id));
}

export function clearCart(): void {
  persist([]);
}

export function isInCart(id: number): boolean {
  return getCart().some((c) => c.id === id);
}

export const MAX_COMPARE_ITEMS = MAX;
export const COMPARE_CART_EVENT = EVENT;
