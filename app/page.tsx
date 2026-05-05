import Layout from '@/components/Layout';
import AptMap, { type FeedItem } from '@/components/AptMap';
import MobileFeedList from '@/components/MobileFeedList';
import { createPublicClient } from '@/lib/supabase/public';

// 매 요청마다 fresh fetch — 피드 즉시 반영 위해 캐시 제거
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 피드 — 글(apt_discussions) + 댓글(apt_discussion_comments) + 커뮤니티 글/댓글 + 매물/호가 합쳐 시간순.
async function fetchFeed(): Promise<FeedItem[]> {
    const supabase = createPublicClient();
    const [{ data: discs }, { data: cmts }, { data: posts }, { data: postComments }, listingsResp, offersResp] = await Promise.all([
      supabase
        .from('apt_discussions')
        .select('id, apt_master_id, author_id, title, content, created_at, apt_master(apt_nm, dong, lat, lng)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('apt_discussion_comments')
        .select('id, discussion_id, author_id, content, created_at, discussion:apt_discussions!discussion_id(title, apt_master_id, apt_master(apt_nm, dong, lat, lng))')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('posts')
        .select('id, author_id, title, content, created_at')
        .eq('category', 'community')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
        .then((r) => r, () => ({ data: null })),
      // 임베드 없이 댓글만 조회 — posts 조인은 별도 쿼리에서 처리 (PostgREST 임베드 실패 시 silent fail 방지)
      supabase
        .from('comments')
        .select('id, post_id, author_id, content, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
        .then((r) => r, () => ({ data: null })),
      // apt_listings — best effort. 테이블 없으면 (SQL 060 미실행) 빈 배열 처리.
      supabase
        .from('apt_listings')
        .select('apt_id, seller_id, price, listed_at, apt_master(apt_nm, dong, lat, lng)')
        .order('listed_at', { ascending: false })
        .limit(20)
        .then((r) => r, () => ({ data: null })),
      // apt_listing_offers — pending 만 (SQL 067 미실행이면 빈 배열).
      // RLS 가 buyer/seller 만 허용 — public client 라 일반 사용자에 한해 본인 관련만 노출.
      supabase
        .from('apt_listing_offers')
        .select('id, apt_id, buyer_id, seller_id, price, kind, message, status, created_at, apt_master:apt_master!apt_id(apt_nm, dong, lat, lng)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30)
        .then((r) => r, () => ({ data: null })),
    ]);
    const listings = (listingsResp as { data: unknown[] | null })?.data ?? null;
    const offers = (offersResp as { data: unknown[] | null })?.data ?? null;

    // 진행중 경매 — 모두 강제 노출 (피드 상단)
    const { data: activeAuctions } = await supabase
      .from('apt_auctions')
      .select('id, apt_id, ends_at, min_bid, current_bid, current_bidder_id, bid_count, created_at, apt_master:apt_master!apt_id(apt_nm, dong, lat, lng)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10)
      .then((r) => r, () => ({ data: null }));

    // 최근 이마트 분양 — 피드 일반 항목 (lat/lng 포함하여 클릭 시 지도 이동 가능)
    const { data: emartOccs } = await supabase
      .from('emart_occupations')
      .select('id, emart_id, user_id, occupied_at, emart:emart_locations!emart_id(name, lat, lng)')
      .order('occupied_at', { ascending: false })
      .limit(20)
      .then((r) => r, () => ({ data: null }));
    const emartRows = ((emartOccs ?? []) as unknown as Array<{ id: number; emart_id: number; user_id: string; occupied_at: string; emart: unknown }>);

    // 최근 공장 분양 (하이닉스/삼성/코스트코/금속노조/화물연대)
    const { data: factoryOccs } = await supabase
      .from('factory_occupations')
      .select('id, factory_id, user_id, occupied_at, factory:factory_locations!factory_id(name, brand, lat, lng)')
      .order('occupied_at', { ascending: false })
      .limit(20)
      .then((r) => r, () => ({ data: null }));
    const factoryRows = ((factoryOccs ?? []) as unknown as Array<{ id: number; factory_id: number; user_id: string; occupied_at: string; factory: unknown }>);

    // 시설 댓글 — 이마트/공장
    const { data: emartCommRaw } = await supabase
      .from('emart_comments')
      .select('id, emart_id, author_id, content, created_at, emart:emart_locations!emart_id(name, lat, lng)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
      .then((r) => r, () => ({ data: null }));
    const emartCommRows = ((emartCommRaw ?? []) as unknown as Array<{ id: number; emart_id: number; author_id: string; content: string; created_at: string; emart: unknown }>);
    const { data: factoryCommRaw } = await supabase
      .from('factory_comments')
      .select('id, factory_id, author_id, content, created_at, factory:factory_locations!factory_id(name, lat, lng)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
      .then((r) => r, () => ({ data: null }));
    const factoryCommRows = ((factoryCommRaw ?? []) as unknown as Array<{ id: number; factory_id: number; author_id: string; content: string; created_at: string; factory: unknown }>);

    // 최근 입찰 — 피드 일반 항목으로 노출
    const { data: recentBids } = await supabase
      .from('auction_bids')
      .select('id, auction_id, bidder_id, amount, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .then((r) => r, () => ({ data: null }));
    const bidRows = (recentBids ?? []) as Array<{ id: number; auction_id: number; bidder_id: string; amount: number; created_at: string }>;
    // 입찰의 apt_nm 조회 (auction_id → apt_master.apt_nm)
    const auctionIds = Array.from(new Set(bidRows.map((b) => b.auction_id)));
    const auctionAptMap = new Map<number, { apt_nm: string | null; lat: number | null; lng: number | null; dong: string | null; apt_master_id: number }>();
    if (auctionIds.length > 0) {
      const { data: aucRows } = await supabase
        .from('apt_auctions')
        .select('id, apt_id, apt_master:apt_master!apt_id(apt_nm, dong, lat, lng)')
        .in('id', auctionIds);
      for (const r of (aucRows ?? []) as unknown as Array<{ id: number; apt_id: number; apt_master: unknown }>) {
        const am = (Array.isArray(r.apt_master) ? r.apt_master[0] : r.apt_master) as { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
        auctionAptMap.set(r.id, {
          apt_nm: am?.apt_nm ?? null,
          dong: am?.dong ?? null,
          lat: am?.lat ?? null,
          lng: am?.lng ?? null,
          apt_master_id: r.apt_id,
        });
      }
    }
    // 입찰자 닉네임 추가 fetch (allAuthorIds 에 추가하기 위함)
    for (const b of bidRows) if (b.bidder_id) {
      // 추가 — profileMap 은 아래에서 단일 fetch 라 별도 처리 필요. 일단 placeholder 로 두고 후처리.
    }

    // postComments 의 post_id → posts(title, category) 별도 조회 (임베드 회피)
    const commentPostIds = Array.from(new Set(((postComments ?? []) as Array<{ post_id: number }>).map((c) => c.post_id).filter(Boolean)));
    const commentPostMap = new Map<number, { title: string | null; category: string | null }>();
    if (commentPostIds.length > 0) {
      const { data: commentPosts } = await supabase
        .from('posts')
        .select('id, title, category')
        .in('id', commentPostIds);
      for (const p of (commentPosts ?? []) as Array<{ id: number; title: string | null; category: string | null }>) {
        commentPostMap.set(p.id, { title: p.title, category: p.category });
      }
    }

    const allAuthorIds = Array.from(new Set([
      ...((discs ?? []).map((d) => (d as Record<string, unknown>).author_id as string)),
      ...((cmts ?? []).map((c) => (c as Record<string, unknown>).author_id as string)),
      ...((posts ?? []).map((p) => (p as Record<string, unknown>).author_id as string)),
      ...((postComments ?? []).map((c) => (c as Record<string, unknown>).author_id as string)),
      ...((listings ?? []).map((l) => (l as Record<string, unknown>).seller_id as string)),
      ...((offers ?? []).map((o) => (o as Record<string, unknown>).buyer_id as string)),
      ...bidRows.map((b) => b.bidder_id),
      ...emartRows.map((e) => e.user_id),
      ...factoryRows.map((f) => f.user_id),
      ...emartCommRows.map((c) => c.author_id),
      ...factoryCommRows.map((c) => c.author_id),
    ].filter(Boolean)));

    type ProfRow = { display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo: boolean | null; avatar_url: string | null; apt_count: number | null };
    const profileMap = new Map<string, ProfRow>();
    if (allAuthorIds.length > 0) {
      const [{ data: profs }, aptCountResp] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, link_url, tier, tier_expires_at, is_solo, avatar_url')
          .in('id', allAuthorIds),
        // SQL 062 적용되면 값이 들어오고, 미적용이면 error → 빈 Map 처리
        supabase.from('profiles').select('id, apt_count').in('id', allAuthorIds)
          .then((r) => r, () => ({ data: null })),
      ]);
      const aptCountMap = new Map<string, number>();
      for (const r of ((aptCountResp as { data: unknown[] | null }).data ?? []) as Array<{ id: string; apt_count: number | null }>) {
        aptCountMap.set(r.id, r.apt_count ?? 0);
      }
      for (const p of (profs ?? []) as Array<{ id: string } & Omit<ProfRow, 'apt_count'>>) {
        profileMap.set(p.id, { ...p, apt_count: aptCountMap.get(p.id) ?? null });
      }
    }
    const now = Date.now();
    const isActivePaid = (p: ProfRow | undefined) => !!p && p.tier === 'paid' && (!p.tier_expires_at || new Date(p.tier_expires_at).getTime() > now);

    // 각 글·댓글의 AI 평가 mlbg 적립 정보 조회 (kind, ref_id 매칭)
    const awardRefIds = Array.from(new Set([
      ...((discs ?? []).map((d) => (d as Record<string, unknown>).id as number)),
      ...((cmts ?? []).map((c) => (c as Record<string, unknown>).id as number)),
      ...((posts ?? []).map((p) => (p as Record<string, unknown>).id as number)),
      ...((postComments ?? []).map((c) => (c as Record<string, unknown>).id as number)),
      ...emartCommRows.map((c) => c.id),
      ...factoryCommRows.map((c) => c.id),
    ]));
    const awardMap = new Map<string, number>();
    if (awardRefIds.length > 0) {
      const { data: awardRows } = await supabase
        .from('mlbg_award_log')
        .select('kind, ref_id, earned')
        .in('ref_id', awardRefIds)
        .then((r) => r, () => ({ data: null }));
      for (const r of (awardRows ?? []) as Array<{ kind: string; ref_id: number; earned: number }>) {
        awardMap.set(`${r.kind}:${r.ref_id}`, Number(r.earned));
      }
    }
    const earnedFor = (kind: string, refId: number): number | null => awardMap.get(`${kind}:${refId}`) ?? null;

    const discussionItems: FeedItem[] = (discs ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const am = row.apt_master as { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
      const prof = profileMap.get(row.author_id as string);
      return {
        kind: 'discussion' as const,
        id: row.id as number,
        apt_master_id: row.apt_master_id as number,
        post_id: null,
        title: row.title as string,
        content: row.content as string | null,
        created_at: row.created_at as string,
        apt_nm: am?.apt_nm ?? null,
        dong: am?.dong ?? null,
        lat: am?.lat ?? null,
        lng: am?.lng ?? null,
        author_id: row.author_id as string,
        author_name: prof?.display_name ?? null,
        author_link: prof?.link_url ?? null,
        author_is_paid: isActivePaid(prof),
        author_is_solo: !!prof?.is_solo,
        author_avatar_url: prof?.avatar_url ?? null,
        author_apt_count: prof?.apt_count ?? null,
        earned_mlbg: earnedFor('apt_post', row.id as number),
      };
    });

    const commentItems: FeedItem[] = (cmts ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const disc = row.discussion as { title: string | null; apt_master_id: number | null; apt_master: { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null } | null;
      const am = disc?.apt_master ?? null;
      const prof = profileMap.get(row.author_id as string);
      return {
        kind: 'comment',
        id: row.id as number,
        apt_master_id: (disc?.apt_master_id ?? 0) as number,
        post_id: null,
        title: disc?.title ?? '(삭제된 글)',
        content: row.content as string | null,
        created_at: row.created_at as string,
        apt_nm: am?.apt_nm ?? null,
        dong: am?.dong ?? null,
        lat: am?.lat ?? null,
        lng: am?.lng ?? null,
        author_id: row.author_id as string,
        author_name: prof?.display_name ?? null,
        author_link: prof?.link_url ?? null,
        author_is_paid: isActivePaid(prof),
        author_is_solo: !!prof?.is_solo,
        author_avatar_url: prof?.avatar_url ?? null,
        author_apt_count: prof?.apt_count ?? null,
        earned_mlbg: earnedFor('apt_comment', row.id as number),
      };
    });

    const postItems: FeedItem[] = (posts ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const prof = profileMap.get(row.author_id as string);
      return {
        kind: 'post' as const,
        id: row.id as number,
        apt_master_id: 0,
        post_id: row.id as number,
        title: row.title as string,
        content: row.content as string | null,
        created_at: row.created_at as string,
        apt_nm: null, dong: null, lat: null, lng: null,
        author_id: row.author_id as string,
        author_name: prof?.display_name ?? null,
        author_link: prof?.link_url ?? null,
        author_is_paid: isActivePaid(prof),
        author_is_solo: !!prof?.is_solo,
        author_avatar_url: prof?.avatar_url ?? null,
        author_apt_count: prof?.apt_count ?? null,
        earned_mlbg: earnedFor('community_post', row.id as number),
      };
    });

    const postCommentItems: FeedItem[] = (postComments ?? [])
      .filter((r) => {
        const post = commentPostMap.get((r as Record<string, unknown>).post_id as number);
        return post?.category === 'community';
      })
      .map((r) => {
        const row = r as Record<string, unknown>;
        const post = commentPostMap.get(row.post_id as number) ?? null;
        const prof = profileMap.get(row.author_id as string);
        return {
          kind: 'post_comment' as const,
          id: row.id as number,
          apt_master_id: 0,
          post_id: row.post_id as number,
          title: post?.title ?? '(삭제된 글)',
          content: row.content as string | null,
          created_at: row.created_at as string,
          apt_nm: null, dong: null, lat: null, lng: null,
          author_id: row.author_id as string,
          author_name: prof?.display_name ?? null,
          author_link: prof?.link_url ?? null,
          author_is_paid: isActivePaid(prof),
          author_is_solo: !!prof?.is_solo,
          author_avatar_url: prof?.avatar_url ?? null,
          author_apt_count: prof?.apt_count ?? null,
          earned_mlbg: earnedFor('community_comment', row.id as number),
        };
      });

    const listingItems: FeedItem[] = (listings ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const am = row.apt_master as { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
      const prof = profileMap.get(row.seller_id as string);
      return {
        kind: 'listing' as const,
        id: row.apt_id as number,
        apt_master_id: row.apt_id as number,
        post_id: null,
        title: `🏷️ ${am?.apt_nm ?? '단지'} 매물`,
        content: `호가 ${Number(row.price).toLocaleString()} mlbg — 잔액 충분하면 즉시 매수 가능`,
        created_at: row.listed_at as string,
        apt_nm: am?.apt_nm ?? null,
        dong: am?.dong ?? null,
        lat: am?.lat ?? null,
        lng: am?.lng ?? null,
        author_id: row.seller_id as string,
        author_name: prof?.display_name ?? null,
        author_link: prof?.link_url ?? null,
        author_is_paid: isActivePaid(prof),
        author_is_solo: !!prof?.is_solo,
        author_avatar_url: prof?.avatar_url ?? null,
        author_apt_count: prof?.apt_count ?? null,
        listing_price: Number(row.price),
      };
    });

    const offerItems: FeedItem[] = (offers ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const am = row.apt_master as { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
      const prof = profileMap.get(row.buyer_id as string);
      const k = row.kind as 'offer' | 'snatch';
      const price = Number(row.price ?? 0);
      const aptName = am?.apt_nm ?? '단지';
      const title = k === 'snatch' ? `${aptName} 내놔 요청 (무상)` : `${aptName} 매수 호가 ${price.toLocaleString()} mlbg`;
      const msg = (row.message as string | null) ?? null;
      return {
        kind: k as 'offer' | 'snatch',
        id: row.id as number,
        apt_master_id: row.apt_id as number,
        post_id: null,
        title,
        content: msg,
        created_at: row.created_at as string,
        apt_nm: am?.apt_nm ?? null,
        dong: am?.dong ?? null,
        lat: am?.lat ?? null,
        lng: am?.lng ?? null,
        author_id: row.buyer_id as string,
        author_name: prof?.display_name ?? null,
        author_link: prof?.link_url ?? null,
        author_is_paid: isActivePaid(prof),
        author_is_solo: !!prof?.is_solo,
        author_avatar_url: prof?.avatar_url ?? null,
        author_apt_count: prof?.apt_count ?? null,
        listing_price: k === 'snatch' ? 0 : price,
      };
    });

    // 진행중 경매 → FeedItem (강제 상단 노출)
    const auctionItems: FeedItem[] = ((activeAuctions ?? []) as Array<Record<string, unknown>>).map((r) => {
      const am = r.apt_master as { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
      const price = Number(r.current_bid ?? r.min_bid ?? 0);
      return {
        kind: 'auction' as const,
        id: r.id as number,
        auction_id: r.id as number,
        apt_master_id: r.apt_id as number,
        post_id: null,
        title: `🔥 ${am?.apt_nm ?? '단지'} LIVE 경매`,
        content: `현재가 ${price.toLocaleString()} mlbg · 입찰 ${(r.bid_count ?? 0)}건`,
        created_at: r.created_at as string,
        ends_at: r.ends_at as string,
        apt_nm: am?.apt_nm ?? null,
        dong: am?.dong ?? null,
        lat: am?.lat ?? null,
        lng: am?.lng ?? null,
        author_id: null,
        author_name: null,
        author_link: null,
        author_is_paid: false,
        author_is_solo: false,
        author_avatar_url: null,
        author_apt_count: null,
        listing_price: price,
      };
    });

    // 입찰 → FeedItem (auction_bid)
    const bidItems: FeedItem[] = bidRows.map((b) => {
      const apt = auctionAptMap.get(b.auction_id);
      const prof = profileMap.get(b.bidder_id);
      return {
        kind: 'auction_bid' as const,
        id: b.id,
        auction_id: b.auction_id,
        apt_master_id: apt?.apt_master_id ?? 0,
        post_id: null,
        title: `입찰 : ${prof?.display_name ?? '익명'} (${Number(b.amount).toLocaleString()} mlbg)`,
        content: apt?.apt_nm ? `${apt.apt_nm}` : null,
        created_at: b.created_at,
        apt_nm: apt?.apt_nm ?? null,
        dong: apt?.dong ?? null,
        lat: apt?.lat ?? null,
        lng: apt?.lng ?? null,
        author_id: b.bidder_id,
        author_name: prof?.display_name ?? null,
        author_link: prof?.link_url ?? null,
        author_is_paid: isActivePaid(prof),
        author_is_solo: !!prof?.is_solo,
        author_avatar_url: prof?.avatar_url ?? null,
        author_apt_count: prof?.apt_count ?? null,
        listing_price: Number(b.amount),
      };
    });

    // 시스템 공지 — 자동 작성된 일반 커뮤니티 글처럼 노출.
    // created_at 을 고정 시점 (분양 개시 시각) 으로 박아서 시간순 정렬에 합류 → 신규 피드가 위로 쌓이며 자연스럽게 묻힘.
    // 어제 시점으로 backdate — 신규 피드 (방금/N분 전) 가 자연스럽게 공지 위로
    const LAUNCH_TS = '2026-05-05T12:00:00+09:00';
    const noticeBase = (id: number, ts: string, title: string, content: string): FeedItem => ({
      kind: 'notice' as const,
      id,
      apt_master_id: 0,
      post_id: null,
      title,
      content,
      created_at: ts,
      apt_nm: null, dong: null, lat: null, lng: null,
      author_id: null, author_name: '분양홍보팀', author_link: null,
      author_is_paid: true, author_is_solo: false, author_avatar_url: null, author_apt_count: null,
    });
    const NOTICE_ITEMS: FeedItem[] = [
      noticeBase(1, LAUNCH_TS, '이마트 분양 시작',
        '이마트 매장이 분양 대상으로 추가됐습니다.\n분양가 5 mlbg, 매일 1 mlbg 자동 수익. 5일이면 회수. 1인 1점포.\n지도 노란 e 핀 클릭 → 분양받기.'),
      noticeBase(2, LAUNCH_TS, 'SK하이닉스 분양 시작',
        'SK하이닉스 이천·청주 캠퍼스가 분양 대상으로 추가됐습니다.\n분양가 1,000 mlbg, 매일 20 mlbg 자동 수익. 50일이면 회수.\n지도 빨간 H 핀 클릭 → 분양받기.'),
      noticeBase(3, LAUNCH_TS, '삼성전자 분양 시작',
        '삼성전자 평택 캠퍼스가 분양 대상으로 추가됐습니다.\n분양가 800 mlbg, 매일 20 mlbg 자동 수익. 40일이면 회수.\n지도 파란 S 핀 클릭 → 분양받기.'),
      noticeBase(4, LAUNCH_TS, '코스트코 분양 시작',
        '코스트코 6개 매장 (양재·상봉·의정부·일산·광명·하남) 이 분양 대상으로 추가됐습니다.\n분양가 50 mlbg, 매일 5 mlbg 자동 수익. 10일이면 회수.\n지도 파란 C 핀 클릭 → 분양받기.'),
      noticeBase(5, LAUNCH_TS, '금속노조 분양 시작',
        '전국금속노조 본부·경기지부·인천지부가 분양 대상으로 추가됐습니다.\n분양가 10 mlbg, 매일 1 mlbg 자동 수익. 10일이면 회수.\n지도 진남색 금속 핀 클릭 → 분양받기.'),
      noticeBase(6, LAUNCH_TS, '화물연대 분양 시작',
        '화물연대 본부·경기지부·부산지부가 분양 대상으로 추가됐습니다.\n분양가 10 mlbg, 매일 1 mlbg 자동 수익. 10일이면 회수.\n지도 초록 화물 핀 클릭 → 분양받기.'),
      noticeBase(7, LAUNCH_TS, '터미널 분양 시작',
        '동서울·센트럴시티·남부터미널이 분양 대상으로 추가됐습니다.\n분양가 10 mlbg, 매일 1 mlbg 자동 수익. 10일이면 회수.\n지도 보라 터 핀 클릭 → 분양받기.'),
      noticeBase(8, LAUNCH_TS, '기차역 분양 시작',
        '서울역·수서역·용산역·청량리역이 분양 대상으로 추가됐습니다.\n분양가 30 mlbg, 매일 2 mlbg 자동 수익. 15일이면 회수.\n지도 진청 역 핀 클릭 → 분양받기.'),
    ];

    // 공장 분양 → FeedItem (factory_occupy)
    const factoryItems: FeedItem[] = factoryRows.map((r) => {
      const f = (Array.isArray(r.factory) ? r.factory[0] : r.factory) as { name?: string | null; brand?: string | null; lat?: number | null; lng?: number | null } | null;
      const prof = profileMap.get(r.user_id);
      const brandLabel = f?.brand === 'hynix' ? 'SK하이닉스' : f?.brand === 'samsung' ? '삼성전자' : f?.brand === 'costco' ? '코스트코' : f?.brand === 'union' ? '금속노조' : f?.brand === 'cargo' ? '화물연대' : f?.brand === 'terminal' ? '터미널' : f?.brand === 'station' ? '기차역' : '시설';
      return {
        kind: 'factory_occupy' as const,
        id: 100000 + r.id,
        apt_master_id: r.factory_id,       // 클릭 시 factory id 로 패널 매칭
        post_id: null,
        title: `${brandLabel} ${f?.name ?? '시설'} 분양받음`,
        content: null,
        created_at: r.occupied_at,
        emart_name: f?.name ?? undefined,
        apt_nm: f?.name ?? null,
        dong: null,
        lat: f?.lat ?? null,
        lng: f?.lng ?? null,
        author_id: r.user_id,
        author_name: prof?.display_name ?? null,
        author_link: prof?.link_url ?? null,
        author_is_paid: isActivePaid(prof),
        author_is_solo: !!prof?.is_solo,
        author_avatar_url: prof?.avatar_url ?? null,
        author_apt_count: prof?.apt_count ?? null,
      };
    });

    const emartItems: FeedItem[] = emartRows.map((r) => {
      const em = (Array.isArray(r.emart) ? r.emart[0] : r.emart) as { name?: string | null; lat?: number | null; lng?: number | null } | null;
      const prof = profileMap.get(r.user_id);
      return {
        kind: 'emart_occupy' as const,
        id: r.id,
        apt_master_id: r.emart_id,         // 클릭 시 emart id 로 패널 매칭
        post_id: null,
        title: `${em?.name ?? '이마트'} 분양받음`,
        content: null,
        created_at: r.occupied_at,
        emart_name: em?.name ?? undefined,
        apt_nm: em?.name ?? null,
        dong: null,
        lat: em?.lat ?? null,
        lng: em?.lng ?? null,
        author_id: r.user_id,
        author_name: prof?.display_name ?? null,
        author_link: prof?.link_url ?? null,
        author_is_paid: isActivePaid(prof),
        author_is_solo: !!prof?.is_solo,
        author_avatar_url: prof?.avatar_url ?? null,
        author_apt_count: prof?.apt_count ?? null,
      };
    });

    // 시설 댓글 → FeedItem (별도 kind, 댓글 스타일로 렌더)
    const facilityCommentItems: FeedItem[] = [
      ...emartCommRows.map((c) => {
        const em = (Array.isArray(c.emart) ? c.emart[0] : c.emart) as { name?: string | null; lat?: number | null; lng?: number | null } | null;
        const prof = profileMap.get(c.author_id);
        return {
          kind: 'emart_comment' as const,
          id: 200000 + c.id,
          apt_master_id: c.emart_id,
          post_id: null,
          title: em?.name ?? '이마트',
          content: c.content,
          created_at: c.created_at,
          emart_name: em?.name ?? undefined,
          apt_nm: em?.name ?? null,
          dong: null,
          lat: em?.lat ?? null,
          lng: em?.lng ?? null,
          author_id: c.author_id,
          author_name: prof?.display_name ?? null,
          author_link: prof?.link_url ?? null,
          author_is_paid: isActivePaid(prof),
          author_is_solo: !!prof?.is_solo,
          author_avatar_url: prof?.avatar_url ?? null,
          author_apt_count: prof?.apt_count ?? null,
          earned_mlbg: earnedFor('emart_comment', c.id),
        } as FeedItem;
      }),
      ...factoryCommRows.map((c) => {
        const f = (Array.isArray(c.factory) ? c.factory[0] : c.factory) as { name?: string | null; lat?: number | null; lng?: number | null } | null;
        const prof = profileMap.get(c.author_id);
        return {
          kind: 'factory_comment' as const,
          id: 300000 + c.id,
          apt_master_id: c.factory_id,
          post_id: null,
          title: f?.name ?? '시설',
          content: c.content,
          created_at: c.created_at,
          emart_name: f?.name ?? undefined,
          apt_nm: f?.name ?? null,
          dong: null,
          lat: f?.lat ?? null,
          lng: f?.lng ?? null,
          author_id: c.author_id,
          author_name: prof?.display_name ?? null,
          author_link: prof?.link_url ?? null,
          author_is_paid: isActivePaid(prof),
          author_is_solo: !!prof?.is_solo,
          author_avatar_url: prof?.avatar_url ?? null,
          author_apt_count: prof?.apt_count ?? null,
          earned_mlbg: earnedFor('factory_comment', c.id),
        } as FeedItem;
      }),
    ];

    // 경매는 강제 최상단 유지. 공지·일반·입찰·이마트·공장은 모두 시간순.
    const others = [...NOTICE_ITEMS, ...discussionItems, ...commentItems, ...postItems, ...postCommentItems, ...listingItems, ...offerItems, ...bidItems, ...emartItems, ...factoryItems, ...facilityCommentItems]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100 - auctionItems.length);
    return [...auctionItems, ...others];
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ view?: string; apt?: string; emart?: string; factory?: string }> }) {
  const sp = await searchParams;
  // 모바일 기본 = 피드. ?view=map 또는 단지/시설 쿼리 있으면 지도 강제 노출.
  const forceMap = sp.view === 'map' || !!sp.apt || !!sp.emart || !!sp.factory;
  const feed = await fetchFeed();

  return (
    <Layout current="home">
      {/* 데스크톱 — 항상 지도. 모바일 forceMap 시에도 지도. */}
      <div className={`flex-1 min-w-0 ${forceMap ? '' : 'hidden md:flex md:flex-col'}`}>
        <AptMap feed={feed} />
      </div>
      {/* 모바일 — forceMap 아닐 때 피드 풀스크린 */}
      {!forceMap && (
        <div className="md:hidden flex-1 min-w-0">
          <MobileFeedList items={feed} />
        </div>
      )}
    </Layout>
  );
}
