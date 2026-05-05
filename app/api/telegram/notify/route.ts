import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { sendTelegramMessage, escapeHtml, preview } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

type Kind = 'apt_post' | 'apt_comment' | 'community_post' | 'community_comment' | 'listing' | 'offer' | 'snatch' | 'auction_start' | 'auction_bid' | 'emart_occupy' | 'factory_occupy';

export async function POST(req: NextRequest) {
  let body: { kind?: string; refId?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const kind = body.kind as Kind;
  const refId = Number(body.refId);
  if (!kind || !['apt_post', 'apt_comment', 'community_post', 'community_comment', 'listing', 'offer', 'snatch', 'auction_start', 'auction_bid', 'emart_occupy', 'factory_occupy'].includes(kind) || !Number.isFinite(refId) || refId <= 0) {
    return NextResponse.json({ error: 'kind/refId invalid' }, { status: 400 });
  }

  // 호출자 인증 (작성자만 본인 글 알림 가능)
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  let tag = '';   // 대괄호 안 짧은 라벨
  let main = '';  // 본문 한 줄

  if (kind === 'community_post') {
    const { data } = await admin.from('posts').select('id, title, author_id, category').eq('id', refId).maybeSingle();
    const r = data as { id: number; title: string; author_id: string; category: string } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    tag = r.category === 'blog' ? '블로그' : '커뮤니티';
    main = preview(r.title, 100);
  } else if (kind === 'community_comment') {
    const { data } = await admin
      .from('comments')
      .select('id, post_id, content, author_id, post:posts!post_id(title, category)')
      .eq('id', refId).maybeSingle();
    const r = data as { id: number; post_id: number; content: string; author_id: string; post: { title: string | null; category: string | null } | null } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    tag = r.post?.category === 'blog' ? '블로그 댓글' : '커뮤니티 댓글';
    main = preview(r.content, 80);
  } else if (kind === 'apt_post') {
    const { data } = await admin
      .from('apt_discussions')
      .select('id, apt_master_id, title, author_id, apt_master(apt_nm)')
      .eq('id', refId).maybeSingle();
    const r = data as { id: number; apt_master_id: number; title: string; author_id: string; apt_master: { apt_nm: string | null } | null } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    tag = r.apt_master?.apt_nm ?? '단지';
    main = preview(r.title, 80);
  } else if (kind === 'apt_comment') {
    const { data } = await admin
      .from('apt_discussion_comments')
      .select('id, discussion_id, content, author_id, discussion:apt_discussions!discussion_id(apt_master_id, apt_master(apt_nm))')
      .eq('id', refId).maybeSingle();
    const r = data as { id: number; discussion_id: number; content: string; author_id: string; discussion: { apt_master_id: number | null; apt_master: { apt_nm: string | null } | null } | null } | null;
    if (!r || r.author_id !== user.id) return NextResponse.json({ error: 'not author' }, { status: 403 });
    tag = r.discussion?.apt_master?.apt_nm ?? '단지';
    main = preview(r.content, 80);
  } else if (kind === 'listing') {
    const { data } = await admin
      .from('apt_listings')
      .select('apt_id, seller_id, price, apt_master(apt_nm)')
      .eq('apt_id', refId).maybeSingle();
    const r = data as { apt_id: number; seller_id: string; price: number; apt_master: { apt_nm: string | null } | null } | null;
    if (!r || r.seller_id !== user.id) return NextResponse.json({ error: 'not seller' }, { status: 403 });
    tag = r.apt_master?.apt_nm ?? '단지';
    main = `매물 ${Number(r.price).toLocaleString()} mlbg`;
  } else if (kind === 'auction_start') {
    // 어드민만 — 새 경매 시작 알림
    const { data: profCheck } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (!(profCheck as { is_admin?: boolean } | null)?.is_admin) {
      return NextResponse.json({ error: 'admin only' }, { status: 403 });
    }
    const { data: auc } = await admin
      .from('apt_auctions')
      .select('id, apt_id, ends_at, min_bid, status, apt_master:apt_master!apt_id(apt_nm)')
      .eq('id', refId).maybeSingle();
    const r = auc as { id: number; apt_id: number; ends_at: string; min_bid: number; status: string; apt_master: { apt_nm: string | null } | null } | null;
    if (!r) return NextResponse.json({ error: 'auction not found' }, { status: 404 });
    tag = '🔥 LIVE 경매';
    const aptName = r.apt_master?.apt_nm ?? '단지';
    const endsKr = new Date(r.ends_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
    main = `${aptName} 시작가 ${Number(r.min_bid).toLocaleString()} mlbg · ${endsKr} 종료`;
  } else if (kind === 'factory_occupy') {
    // refId = factory_locations.id. 본인 occupier 검증.
    const { data: occ } = await admin
      .from('factory_occupations')
      .select('user_id, factory_id, factory:factory_locations!factory_id(name, brand)')
      .eq('factory_id', refId)
      .maybeSingle();
    const r = occ as { user_id: string; factory_id: number; factory: unknown } | null;
    if (!r) return NextResponse.json({ error: 'factory not occupied' }, { status: 404 });
    if (r.user_id !== user.id) return NextResponse.json({ error: 'not occupier' }, { status: 403 });
    const f = (Array.isArray(r.factory) ? r.factory[0] : r.factory) as { name?: string | null; brand?: string | null } | null;
    const labels: Record<string, string> = { hynix: '🏭 SK하이닉스', samsung: '🏭 삼성전자', costco: '🛒 코스트코', union: '🚩 금속노조' };
    tag = labels[f?.brand ?? ''] ?? '🏭 공장';
    main = `${f?.name ?? '공장'} 분양받음`;
  } else if (kind === 'emart_occupy') {
    // refId = emart_locations.id. 분양받은 본인만 발송 가능 (검증).
    const { data: occ } = await admin
      .from('emart_occupations')
      .select('user_id, emart_id, emart:emart_locations!emart_id(name)')
      .eq('emart_id', refId)
      .maybeSingle();
    const r = occ as { user_id: string; emart_id: number; emart: unknown } | null;
    if (!r) return NextResponse.json({ error: 'emart not occupied' }, { status: 404 });
    if (r.user_id !== user.id) return NextResponse.json({ error: 'not occupier' }, { status: 403 });
    const em = (Array.isArray(r.emart) ? r.emart[0] : r.emart) as { name?: string | null } | null;
    tag = '🛒 이마트 분양';
    main = `${em?.name ?? '이마트'}`;
  } else if (kind === 'auction_bid') {
    // 입찰자 본인만 — 현재가 갱신 알림. 락은 race-y 하지만 latest current_bidder_id 검증으로 가벼운 boundary.
    const { data: auc } = await admin
      .from('apt_auctions')
      .select('id, apt_id, current_bid, current_bidder_id, ends_at, bid_count, apt_master:apt_master!apt_id(apt_nm)')
      .eq('id', refId).maybeSingle();
    const r = auc as { id: number; apt_id: number; current_bid: number | null; current_bidder_id: string | null; ends_at: string; bid_count: number; apt_master: { apt_nm: string | null } | null } | null;
    if (!r) return NextResponse.json({ error: 'auction not found' }, { status: 404 });
    if (r.current_bidder_id !== user.id) {
      return NextResponse.json({ error: 'not latest bidder' }, { status: 403 });
    }
    const aptName = r.apt_master?.apt_nm ?? '단지';
    const { data: pr } = await admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const bidderName = (pr as { display_name?: string | null } | null)?.display_name ?? '익명';
    tag = '⚡ 경매 입찰';
    main = `${aptName} ${Number(r.current_bid ?? 0).toLocaleString()} mlbg 갱신 (${bidderName} 님 · 누적 ${r.bid_count}건)`;
  } else if (kind === 'offer' || kind === 'snatch') {
    // refId = apt_listing_offers.id. 매수 호가 / 내놔 알림.
    const { data } = await admin
      .from('apt_listing_offers')
      .select('id, apt_id, buyer_id, price, kind, message')
      .eq('id', refId).maybeSingle();
    const r = data as { id: number; apt_id: number; buyer_id: string; price: number; kind: string; message: string | null } | null;
    if (!r || r.buyer_id !== user.id) return NextResponse.json({ error: 'not buyer' }, { status: 403 });
    const { data: apt } = await admin.from('apt_master').select('apt_nm').eq('id', r.apt_id).maybeSingle();
    tag = (apt as { apt_nm: string | null } | null)?.apt_nm ?? '단지';
    if (r.kind === 'snatch') {
      main = '내놔 요청 (무상)';
    } else {
      main = `매수 호가 ${Number(r.price).toLocaleString()} mlbg`;
    }
    if (r.message) main += ` — ${r.message.slice(0, 60)}`;
  }

  // 작성자 닉네임
  const { data: prof } = await admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const author = (prof as { display_name: string | null } | null)?.display_name ?? '회원';

  // 포맷: [tag] author : main
  const text = `[${escapeHtml(tag)}] ${escapeHtml(author)} : ${escapeHtml(main)}`;
  const result = await sendTelegramMessage(text, { parseMode: 'HTML', disablePreview: true });
  if (!result.ok) {
    console.error('[telegram/notify] send failed:', result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message_id: result.message_id });
}
