import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { sendTelegramMessage, escapeHtml, preview } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

type Kind = 'apt_post' | 'apt_comment' | 'community_post' | 'community_comment' | 'listing' | 'offer' | 'snatch' | 'auction_start' | 'auction_bid' | 'auction_completed' | 'emart_occupy' | 'factory_occupy' | 'strike';

export async function POST(req: NextRequest) {
  let body: { kind?: string; refId?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const kind = body.kind as Kind;
  const refId = Number(body.refId);
  if (!kind || !['apt_post', 'apt_comment', 'community_post', 'community_comment', 'listing', 'offer', 'snatch', 'auction_start', 'auction_bid', 'auction_completed', 'emart_occupy', 'factory_occupy', 'strike'].includes(kind) || !Number.isFinite(refId) || refId <= 0) {
    return NextResponse.json({ error: 'kind/refId invalid' }, { status: 400 });
  }

  // auction_completed 는 시스템 트리거 — 인증 없이 호출 가능. 단 DB 에서 status/notified_at 으로 1회성 보장.
  // 그 외 kind 는 작성자 인증 필요.
  const sb = await createClient();
  const { data: { user: maybeUser } } = await sb.auth.getUser();
  if (kind !== 'auction_completed' && !maybeUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  // auction_completed 가 아닌 경우엔 위 분기로 보장됨 → 아래에선 user 사용 가능.
  // auction_completed 분기 안에선 user 직접 참조 안 함 (handler 에서 별도 처리).
  const user = maybeUser as { id: string } & NonNullable<typeof maybeUser>;

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
      .select('id, asset_type, asset_id, ends_at, min_bid, status')
      .eq('id', refId).maybeSingle();
    const r = auc as { id: number; asset_type: 'apt' | 'factory' | 'emart'; asset_id: number; ends_at: string; min_bid: number; status: string } | null;
    if (!r) return NextResponse.json({ error: 'auction not found' }, { status: 404 });
    // 자산 타입별 이름 fetch
    let assetName = '자산';
    let typePrefix = '';
    if (r.asset_type === 'apt') {
      const { data: apt } = await admin.from('apt_master').select('apt_nm').eq('id', r.asset_id).maybeSingle();
      assetName = (apt as { apt_nm: string | null } | null)?.apt_nm ?? '단지';
    } else if (r.asset_type === 'factory') {
      const { data: f } = await admin.from('factory_locations').select('name, brand').eq('id', r.asset_id).maybeSingle();
      const fr = f as { name: string | null; brand: string | null } | null;
      const brandLabel: Record<string, string> = { hynix: 'SK하이닉스', samsung: '삼성전자', costco: '코스트코', union: '금속노조', cargo: '화물연대', terminal: '터미널', station: '기차역', party_dem: '더불어민주당', party_ppl: '국민의힘', party_jhs: '조국혁신당', party_ref: '개혁신당', party_jin: '진보당', party_basic: '기본소득당', party_sd: '사회민주당' };
      typePrefix = brandLabel[fr?.brand ?? ''] ?? '시설';
      assetName = fr?.name ?? '시설';
    } else if (r.asset_type === 'emart') {
      const { data: e } = await admin.from('emart_locations').select('name').eq('id', r.asset_id).maybeSingle();
      typePrefix = '이마트';
      assetName = (e as { name: string | null } | null)?.name ?? '매장';
    }
    tag = '🔥 LIVE 경매';
    const fullName = typePrefix ? `${typePrefix} ${assetName}` : assetName;
    const endsKr = new Date(r.ends_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
    main = `${fullName} 시작가 ${Number(r.min_bid).toLocaleString()} mlbg · ${endsKr} 종료`;
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
    const labels: Record<string, string> = { hynix: '🏭 SK하이닉스', samsung: '🏭 삼성전자', costco: '🛒 코스트코', union: '🚩 금속노조', cargo: '🚛 화물연대', terminal: '🚌 터미널', station: '🚉 기차역' };
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
    // race condition fix — current_bidder_id 직접 비교 시, 알림 호출 직전에 다른 사용자가 outbid 하면
    // current_bidder_id !== user.id 가 되어 정당한 입찰 알림이 누락됨. (실제 사고: 반포리체 후상 누락 2026-05-06)
    // 본인의 60초 이내 최근 입찰 row 존재 여부로 권한 검증 → race 가 와도 알림 발송 보장.
    const { data: myBid } = await admin
      .from('auction_bids')
      .select('id, amount, created_at')
      .eq('auction_id', refId)
      .eq('bidder_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const b = myBid as { id: number; amount: number; created_at: string } | null;
    if (!b) return NextResponse.json({ error: 'no bid by user' }, { status: 403 });
    if (Date.now() - new Date(b.created_at).getTime() > 60_000) {
      return NextResponse.json({ error: 'bid too old (>60s)' }, { status: 403 });
    }

    const { data: auc } = await admin
      .from('apt_auctions')
      .select('id, asset_type, asset_id, current_bid, current_bidder_id, ends_at, bid_count')
      .eq('id', refId).maybeSingle();
    const r = auc as { id: number; asset_type: 'apt' | 'factory' | 'emart'; asset_id: number; current_bid: number | null; current_bidder_id: string | null; ends_at: string; bid_count: number } | null;
    if (!r) return NextResponse.json({ error: 'auction not found' }, { status: 404 });

    // 자산 이름
    let assetName = '자산';
    if (r.asset_type === 'apt') {
      const { data: apt } = await admin.from('apt_master').select('apt_nm').eq('id', r.asset_id).maybeSingle();
      assetName = (apt as { apt_nm: string | null } | null)?.apt_nm ?? '단지';
    } else if (r.asset_type === 'factory') {
      const { data: f } = await admin.from('factory_locations').select('name, brand').eq('id', r.asset_id).maybeSingle();
      const fr = f as { name: string | null; brand: string | null } | null;
      const brandLabel: Record<string, string> = { hynix: 'SK하이닉스', samsung: '삼성전자', costco: '코스트코', union: '금속노조', cargo: '화물연대', terminal: '터미널', station: '기차역', party_dem: '더불어민주당', party_ppl: '국민의힘', party_jhs: '조국혁신당', party_ref: '개혁신당', party_jin: '진보당', party_basic: '기본소득당', party_sd: '사회민주당' };
      assetName = `${brandLabel[fr?.brand ?? ''] ?? ''} ${fr?.name ?? '시설'}`.trim();
    } else if (r.asset_type === 'emart') {
      const { data: e } = await admin.from('emart_locations').select('name').eq('id', r.asset_id).maybeSingle();
      assetName = (e as { name: string | null } | null)?.name ?? '매장';
    }

    const { data: pr } = await admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const bidderName = (pr as { display_name?: string | null } | null)?.display_name ?? '익명';
    const isLeader = r.current_bidder_id === user.id;
    tag = '⚡ 경매 입찰';
    main = isLeader
      ? `${assetName} ${Number(r.current_bid ?? 0).toLocaleString()} mlbg 갱신 (${bidderName} 님 · 누적 ${r.bid_count}건)`
      : `${assetName} ${Number(b.amount).toLocaleString()} mlbg 입찰 (${bidderName} 님 — 직후 ${Number(r.current_bid ?? 0).toLocaleString()} 으로 갱신됨)`;
  } else if (kind === 'auction_completed') {
    // 시스템 알림 — auction_cleanup endpoint 가 pop_unnotified_completed_auctions 후 호출.
    // refId = auction_id. notified_at 마킹은 RPC 가 이미 했으므로 여기선 단순 발송.
    const { data: auc } = await admin
      .from('apt_auctions')
      .select('id, asset_type, asset_id, current_bid, current_bidder_id, bid_count, status')
      .eq('id', refId).maybeSingle();
    const r = auc as { id: number; asset_type: 'apt' | 'factory' | 'emart'; asset_id: number; current_bid: number | null; current_bidder_id: string | null; bid_count: number; status: string } | null;
    if (!r) return NextResponse.json({ error: 'auction not found' }, { status: 404 });
    if (r.status !== 'completed' || r.current_bidder_id == null) {
      return NextResponse.json({ error: 'not a completed auction' }, { status: 400 });
    }
    let assetName = '자산';
    if (r.asset_type === 'apt') {
      const { data: apt } = await admin.from('apt_master').select('apt_nm').eq('id', r.asset_id).maybeSingle();
      assetName = (apt as { apt_nm: string | null } | null)?.apt_nm ?? '단지';
    } else if (r.asset_type === 'factory') {
      const { data: f } = await admin.from('factory_locations').select('name, brand').eq('id', r.asset_id).maybeSingle();
      const fr = f as { name: string | null; brand: string | null } | null;
      const brandLabel: Record<string, string> = { hynix: 'SK하이닉스', samsung: '삼성전자', costco: '코스트코', union: '금속노조', cargo: '화물연대', terminal: '터미널', station: '기차역', party_dem: '더불어민주당', party_ppl: '국민의힘', party_jhs: '조국혁신당', party_ref: '개혁신당', party_jin: '진보당', party_basic: '기본소득당', party_sd: '사회민주당' };
      assetName = `${brandLabel[fr?.brand ?? ''] ?? ''} ${fr?.name ?? '시설'}`.trim();
    } else if (r.asset_type === 'emart') {
      const { data: e } = await admin.from('emart_locations').select('name').eq('id', r.asset_id).maybeSingle();
      assetName = (e as { name: string | null } | null)?.name ?? '매장';
    }
    const { data: wpr } = await admin.from('profiles').select('display_name').eq('id', r.current_bidder_id).maybeSingle();
    const winnerName = (wpr as { display_name?: string | null } | null)?.display_name ?? '익명';
    tag = '🏆 경매 낙찰';
    main = `${assetName} — ${winnerName} 님 ${Number(r.current_bid ?? 0).toLocaleString()} mlbg 낙찰 (총 입찰 ${r.bid_count}건)`;

    // auction_completed 는 user 가 null 일 수 있음 → 작성자명 fetch 건너뛰고 직접 발송
    const text = `[${escapeHtml(tag)}] ${escapeHtml(main)}`;
    const result = await sendTelegramMessage(text, { parseMode: 'HTML', disablePreview: true });
    if (!result.ok) {
      console.error('[telegram/notify] auction_completed send failed:', result.error);
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, message_id: result.message_id });
  } else if (kind === 'strike') {
    // refId = strike_events.id. 어드민이 파업 누르면 호출.
    const { data: ev } = await admin
      .from('strike_events')
      .select('id, asset_type, asset_id, occupier_id, loss_pct, loss_mlbg, created_by')
      .eq('id', refId).maybeSingle();
    const e = ev as { id: number; asset_type: 'factory' | 'emart'; asset_id: number; occupier_id: string; loss_pct: number; loss_mlbg: number; created_by: string } | null;
    if (!e) return NextResponse.json({ error: 'strike not found' }, { status: 404 });
    if (e.created_by !== user.id) return NextResponse.json({ error: 'not creator' }, { status: 403 });
    let assetName = '자산';
    if (e.asset_type === 'factory') {
      const { data: f } = await admin.from('factory_locations').select('name, brand').eq('id', e.asset_id).maybeSingle();
      const fr = f as { name: string | null; brand: string | null } | null;
      const brandLabel: Record<string, string> = { hynix: 'SK하이닉스', samsung: '삼성전자', costco: '코스트코', union: '금속노조', cargo: '화물연대', terminal: '터미널', station: '기차역', party_dem: '더불어민주당', party_ppl: '국민의힘', party_jhs: '조국혁신당', party_ref: '개혁신당', party_jin: '진보당', party_basic: '기본소득당', party_sd: '사회민주당' };
      assetName = `${brandLabel[fr?.brand ?? ''] ?? ''} ${fr?.name ?? '시설'}`.trim();
    } else {
      const { data: m } = await admin.from('emart_locations').select('name').eq('id', e.asset_id).maybeSingle();
      assetName = (m as { name: string | null } | null)?.name ?? '매장';
    }
    const { data: op } = await admin.from('profiles').select('display_name').eq('id', e.occupier_id).maybeSingle();
    const opName = (op as { display_name: string | null } | null)?.display_name ?? '점거자';
    tag = '💥 파업';
    main = `${assetName} — ${opName} 님 ${Number(e.loss_pct)}% (${Number(e.loss_mlbg).toLocaleString()} mlbg) 삭감`;
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
