import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .rpc('list_emart_with_occupation')
    .then((r) => r, () => ({ data: null }));
  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
