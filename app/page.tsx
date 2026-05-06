import Layout from '@/components/Layout';
import { type FeedItem } from '@/components/AptMap';
import HomeMobileSwitcher from '@/components/HomeMobileSwitcher';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

// fetchFeed 는 unstable_cache 로 30초 캐싱 + 'home-feed' 태그.
// 글/댓글/매물 등 mutation 직후 클라이언트에서 /api/revalidate-home 호출 → 즉시 무효화.
// Layout 이 cookies() 를 쓰므로 페이지 자체는 dynamic 렌더, fetchFeed 만 캐싱됨.

// 피드 — 글(apt_discussions) + 댓글(apt_discussion_comments) + 커뮤니티 글/댓글 + 매물/호가 합쳐 시간순.
async function fetchFeedRaw(): Promise<FeedItem[]> {
    const supabase = createPublicClient();
    const [{ data: discs }, { data: cmts }, { data: posts }, { data: postComments }, listingsResp, offersResp] = await Promise.all([
      supabase
        .from('apt_discussions')
        .select('id, apt_master_id, author_id, title, content, like_count, created_at, apt_master(apt_nm, dong, lat, lng)')
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
        .select('id, author_id, title, content, category, created_at')
        .in('category', ['community', 'hotdeal'])
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

    // 진행중 경매 — 모두 강제 노출 (피드 상단). asset_type 별로 위치/이름 후처리.
    const { data: activeAuctionsRaw } = await supabase
      .from('apt_auctions')
      .select('id, apt_id, asset_type, asset_id, ends_at, min_bid, current_bid, current_bidder_id, bid_count, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10)
      .then((r) => r, () => ({ data: null }));
    type RawAuc = { id: number; apt_id: number | null; asset_type: 'apt' | 'factory' | 'emart' | null; asset_id: number | null; ends_at: string; min_bid: number; current_bid: number | null; current_bidder_id: string | null; bid_count: number; created_at: string };
    const aucList = (activeAuctionsRaw ?? []) as RawAuc[];
    // 자산 타입별로 id 모으기 → 일괄 fetch
    const aucAptIds: number[] = [], aucFactoryIds: number[] = [], aucEmartIds: number[] = [];
    for (const a of aucList) {
      const aType = a.asset_type ?? 'apt';
      const aId = a.asset_id ?? a.apt_id ?? 0;
      if (aType === 'apt' && aId) aucAptIds.push(aId);
      else if (aType === 'factory' && aId) aucFactoryIds.push(aId);
      else if (aType === 'emart' && aId) aucEmartIds.push(aId);
    }
    const aucAssetMap = new Map<string, { name: string; lat: number | null; lng: number | null; dong: string | null }>();
    if (aucAptIds.length > 0) {
      const { data } = await supabase.from('apt_master').select('id, apt_nm, dong, lat, lng').in('id', aucAptIds);
      for (const r of (data ?? []) as Array<{ id: number; apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null }>) {
        aucAssetMap.set(`apt:${r.id}`, { name: r.apt_nm ?? '단지', lat: r.lat, lng: r.lng, dong: r.dong });
      }
    }
    if (aucFactoryIds.length > 0) {
      const { data } = await supabase.from('factory_locations').select('id, name, lat, lng').in('id', aucFactoryIds);
      for (const r of (data ?? []) as Array<{ id: number; name: string; lat: number | null; lng: number | null }>) {
        aucAssetMap.set(`factory:${r.id}`, { name: r.name, lat: r.lat, lng: r.lng, dong: null });
      }
    }
    if (aucEmartIds.length > 0) {
      const { data } = await supabase.from('emart_locations').select('id, name, lat, lng').in('id', aucEmartIds);
      for (const r of (data ?? []) as Array<{ id: number; name: string; lat: number | null; lng: number | null }>) {
        aucAssetMap.set(`emart:${r.id}`, { name: r.name, lat: r.lat, lng: r.lng, dong: null });
      }
    }
    const activeAuctions = aucList.map((r) => {
      const aType = r.asset_type ?? 'apt';
      const aId = r.asset_id ?? r.apt_id ?? 0;
      const info = aucAssetMap.get(`${aType}:${aId}`) ?? { name: '자산', lat: null, lng: null, dong: null };
      return { ...r, _assetName: info.name, _assetLat: info.lat, _assetLng: info.lng, _assetDong: info.dong, _assetType: aType, _assetId: aId };
    });

    // 최근 이마트 분양 — 피드 일반 항목 (lat/lng 포함하여 클릭 시 지도 이동 가능)
    const { data: emartOccs } = await supabase
      .from('emart_occupations')
      .select('id, emart_id, user_id, occupied_at, emart:emart_locations!emart_id(name, lat, lng)')
      .order('occupied_at', { ascending: false })
      .limit(20)
      .then((r) => r, () => ({ data: null }));
    const emartRows = ((emartOccs ?? []) as unknown as Array<{ id: number; emart_id: number; user_id: string; occupied_at: string; emart: unknown }>);

    // 최근 파업 — 24시간 이내. RPC list_recent_strikes 가 자산명·점거자명 조인까지 처리.
    const { data: strikeRowsRaw } = await supabase
      .rpc('list_recent_strikes', { p_limit: 20 })
      .then((r) => r, () => ({ data: null }));
    const strikeRows = (strikeRowsRaw ?? []) as Array<{
      id: number; asset_type: 'factory' | 'emart'; asset_id: number; asset_name: string | null;
      occupier_id: string; occupier_name: string | null;
      loss_pct: number; loss_mlbg: number; created_at: string;
    }>;

    // 최근 다리 통행료 — 24시간 이내 (RPC list_recent_bridge_tolls / SQL 132).
    const { data: tollRowsRaw } = await supabase
      .rpc('list_recent_bridge_tolls', { p_limit: 30 })
      .then((r) => r, () => ({ data: null }));
    const tollRows = (tollRowsRaw ?? []) as Array<{
      id: number; bridge_id: number; bridge_name: string | null;
      payer_id: string; payer_name: string | null;
      owner_id: string | null; owner_name: string | null;
      amount: number; created_at: string;
    }>;

    // 최근 거래성사 — apt_occupier_events 의 'sell' 이벤트 (24시간).
    const sellSince = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: sellRowsRaw } = await supabase
      .from('apt_occupier_events')
      .select('id, apt_id, actor_id, actor_name, prev_occupier_id, prev_occupier_name, actor_score, created_at, apt_master:apt_master!apt_id(apt_nm, dong, lat, lng)')
      .eq('event', 'sell')
      .gte('created_at', sellSince)
      .order('created_at', { ascending: false })
      .limit(30)
      .then((r) => r, () => ({ data: null }));
    const sellRows = ((sellRowsRaw ?? []) as unknown as Array<{
      id: number; apt_id: number;
      actor_id: string; actor_name: string | null;
      prev_occupier_id: string | null; prev_occupier_name: string | null;
      actor_score: number | null; created_at: string;
      apt_master: { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
    }>);

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
      // asset_type 별로 자산 정보 fetch — apt_master / factory_locations / emart_locations
      const { data: aucRows } = await supabase
        .from('apt_auctions')
        .select('id, apt_id, asset_type, asset_id')
        .in('id', auctionIds);
      type AucMeta = { id: number; apt_id: number | null; asset_type: 'apt' | 'factory' | 'emart' | null; asset_id: number | null };
      const aucMetas = (aucRows ?? []) as AucMeta[];
      const aIds: number[] = [], fIds: number[] = [], eIds: number[] = [];
      for (const r of aucMetas) {
        const t = r.asset_type ?? 'apt';
        const aid = r.asset_id ?? r.apt_id ?? 0;
        if (!aid) continue;
        if (t === 'apt') aIds.push(aid);
        else if (t === 'factory') fIds.push(aid);
        else if (t === 'emart') eIds.push(aid);
      }
      const assetMap = new Map<string, { name: string | null; dong: string | null; lat: number | null; lng: number | null }>();
      if (aIds.length > 0) {
        const { data } = await supabase.from('apt_master').select('id, apt_nm, dong, lat, lng').in('id', aIds);
        for (const r of (data ?? []) as Array<{ id: number; apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null }>) {
          assetMap.set(`apt:${r.id}`, { name: r.apt_nm, dong: r.dong, lat: r.lat, lng: r.lng });
        }
      }
      if (fIds.length > 0) {
        const { data } = await supabase.from('factory_locations').select('id, name, lat, lng').in('id', fIds);
        for (const r of (data ?? []) as Array<{ id: number; name: string; lat: number | null; lng: number | null }>) {
          assetMap.set(`factory:${r.id}`, { name: r.name, dong: null, lat: r.lat, lng: r.lng });
        }
      }
      if (eIds.length > 0) {
        const { data } = await supabase.from('emart_locations').select('id, name, lat, lng').in('id', eIds);
        for (const r of (data ?? []) as Array<{ id: number; name: string; lat: number | null; lng: number | null }>) {
          assetMap.set(`emart:${r.id}`, { name: r.name, dong: null, lat: r.lat, lng: r.lng });
        }
      }
      for (const r of aucMetas) {
        const t = r.asset_type ?? 'apt';
        const aid = r.asset_id ?? r.apt_id ?? 0;
        const info = assetMap.get(`${t}:${aid}`) ?? { name: null, dong: null, lat: null, lng: null };
        auctionAptMap.set(r.id, {
          apt_nm: info.name,
          dong: info.dong,
          lat: info.lat,
          lng: info.lng,
          apt_master_id: t === 'apt' ? aid : 0,
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

    // 댓글 카운트 — 단지 토론 / 커뮤니티 글 / 시설 분양 별로 부모 id → count 매핑
    const discIds = (discs ?? []).map((d) => (d as { id: number }).id);
    const postIds = (posts ?? []).map((p) => (p as { id: number }).id);
    const emartIds = emartRows.map((e) => e.emart_id);
    const factoryIds = factoryRows.map((f) => f.factory_id);

    const [discCommRows, postCommRows, emartCommCntRows, factoryCommCntRows] = await Promise.all([
      discIds.length > 0
        ? supabase.from('apt_discussion_comments').select('discussion_id').in('discussion_id', discIds).is('deleted_at', null)
            .then((r) => (r.data ?? []) as Array<{ discussion_id: number }>, () => [] as Array<{ discussion_id: number }>)
        : Promise.resolve([] as Array<{ discussion_id: number }>),
      postIds.length > 0
        ? supabase.from('comments').select('post_id').in('post_id', postIds).is('deleted_at', null)
            .then((r) => (r.data ?? []) as Array<{ post_id: number }>, () => [] as Array<{ post_id: number }>)
        : Promise.resolve([] as Array<{ post_id: number }>),
      emartIds.length > 0
        ? supabase.from('emart_comments').select('emart_id').in('emart_id', emartIds).is('deleted_at', null)
            .then((r) => (r.data ?? []) as Array<{ emart_id: number }>, () => [] as Array<{ emart_id: number }>)
        : Promise.resolve([] as Array<{ emart_id: number }>),
      factoryIds.length > 0
        ? supabase.from('factory_comments').select('factory_id').in('factory_id', factoryIds).is('deleted_at', null)
            .then((r) => (r.data ?? []) as Array<{ factory_id: number }>, () => [] as Array<{ factory_id: number }>)
        : Promise.resolve([] as Array<{ factory_id: number }>),
    ]);
    const discCommCnt = new Map<number, number>();
    for (const r of discCommRows) discCommCnt.set(r.discussion_id, (discCommCnt.get(r.discussion_id) ?? 0) + 1);
    const postCommCnt = new Map<number, number>();
    for (const r of postCommRows) postCommCnt.set(r.post_id, (postCommCnt.get(r.post_id) ?? 0) + 1);
    const emartCommCnt = new Map<number, number>();
    for (const r of emartCommCntRows) emartCommCnt.set(r.emart_id, (emartCommCnt.get(r.emart_id) ?? 0) + 1);
    const factoryCommCnt = new Map<number, number>();
    for (const r of factoryCommCntRows) factoryCommCnt.set(r.factory_id, (factoryCommCnt.get(r.factory_id) ?? 0) + 1);
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
        comment_count: discCommCnt.get(row.id as number) ?? 0,
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
        discussion_id: row.discussion_id as number,
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
      const cat = (row.category as 'community' | 'hotdeal' | undefined) ?? 'community';
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
        earned_mlbg: cat === 'hotdeal' ? earnedFor('hotdeal_post', row.id as number) : earnedFor('community_post', row.id as number),
        comment_count: postCommCnt.get(row.id as number) ?? 0,
        post_category: cat,
      };
    });

    const postCommentItems: FeedItem[] = (postComments ?? [])
      .filter((r) => {
        const post = commentPostMap.get((r as Record<string, unknown>).post_id as number);
        return post?.category === 'community' || post?.category === 'hotdeal';
      })
      .map((r) => {
        const row = r as Record<string, unknown>;
        const post = commentPostMap.get(row.post_id as number) ?? null;
        const prof = profileMap.get(row.author_id as string);
        const cat = (post?.category as 'community' | 'hotdeal' | undefined) ?? 'community';
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
          earned_mlbg: cat === 'hotdeal' ? earnedFor('hotdeal_comment', row.id as number) : earnedFor('community_comment', row.id as number),
          post_category: cat,
        };
      });

    const listingItems: FeedItem[] = (listings ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const am = row.apt_master as { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
      const prof = profileMap.get(row.seller_id as string);
      const aptLabel = am?.apt_nm ? (am.dong ? `${am.dong} ${am.apt_nm}` : am.apt_nm) : '단지';
      return {
        kind: 'listing' as const,
        id: row.apt_id as number,
        apt_master_id: row.apt_id as number,
        post_id: null,
        title: `🏷️ ${aptLabel} 매물`,
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
      const aptName = am?.apt_nm ? (am.dong ? `${am.dong} ${am.apt_nm}` : am.apt_nm) : '단지';
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
    const auctionItems: FeedItem[] = activeAuctions.map((r) => {
      const price = Number(r.current_bid ?? r.min_bid ?? 0);
      return {
        kind: 'auction' as const,
        id: r.id,
        auction_id: r.id,
        apt_master_id: r._assetType === 'apt' ? r._assetId : 0,
        post_id: null,
        title: `🔥 ${r._assetName} LIVE 경매`,
        content: `현재가 ${price.toLocaleString()} mlbg · 입찰 ${(r.bid_count ?? 0)}건`,
        created_at: r.created_at,
        ends_at: r.ends_at,
        apt_nm: r._assetName,
        dong: r._assetDong,
        lat: r._assetLat,
        lng: r._assetLng,
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
    // 사이트 공지 (어드민이 작성한 동적 공지) — 카페 새 글 푸시 등
    const { data: annRows } = await supabase
      .from('site_announcements')
      .select('id, title, body, link_url, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
      .then((r) => r, () => ({ data: null }));
    const announcementItems: FeedItem[] = ((annRows ?? []) as Array<{ id: number; title: string; body: string | null; link_url: string | null; created_at: string }>).map((a) => ({
      kind: 'notice' as const,
      id: 500000 + a.id,
      apt_master_id: 0,
      post_id: null,
      title: a.title,
      content: a.body,
      created_at: a.created_at,
      apt_nm: null, dong: null, lat: null, lng: null,
      author_id: null, author_name: '공지', author_link: null,
      author_is_paid: true, author_is_solo: false, author_avatar_url: null, author_apt_count: null,
      notice_href: a.link_url ?? undefined,
    }));

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
      const brandLabelMap: Record<string, string> = { hynix: 'SK하이닉스', samsung: '삼성전자', costco: '코스트코', union: '금속노조', cargo: '화물연대', terminal: '터미널', station: '기차역', party_dem: '더불어민주당', party_ppl: '국민의힘', party_jhs: '조국혁신당', party_ref: '개혁신당', party_jin: '진보당', party_basic: '기본소득당', party_sd: '사회민주당', park: '공원', amusement: '놀이동산', bridge: '다리' };
      const brandLabel = brandLabelMap[f?.brand ?? ''] ?? '시설';
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
        comment_count: factoryCommCnt.get(r.factory_id) ?? 0,
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
        comment_count: emartCommCnt.get(r.emart_id) ?? 0,
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

    // 파업 이벤트 → FeedItem (kind 'strike')
    const strikeItems: FeedItem[] = strikeRows.map((s) => ({
      kind: 'strike' as const,
      id: 400000 + s.id,
      apt_master_id: 0,
      post_id: null,
      title: '💥 파업',
      content: `[${s.asset_name ?? '자산'}] ${s.occupier_name ?? '점거자'} 님 ${Number(s.loss_pct)}% 삭감 (${Number(s.loss_mlbg).toLocaleString()} mlbg)`,
      created_at: s.created_at,
      apt_nm: s.asset_name ?? null,
      dong: null,
      lat: null, lng: null,
      author_id: s.occupier_id,
      author_name: s.occupier_name,
      author_link: null,
      author_is_paid: false, author_is_solo: false,
      author_avatar_url: null, author_apt_count: null,
      strike_loss_pct: Number(s.loss_pct),
      strike_loss_mlbg: Number(s.loss_mlbg),
    } as FeedItem));

    // 다리 통행료 → FeedItem (kind 'bridge_toll')
    const tollItems: FeedItem[] = tollRows.map((t) => ({
      kind: 'bridge_toll' as const,
      id: 600000 + t.id,
      apt_master_id: 0,
      post_id: null,
      title: '🌉 통행료',
      content: `${t.payer_name ?? '익명'} → ${t.owner_name ?? '미점거'} | ${t.bridge_name ?? '다리'} | ${Number(t.amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} mlbg`,
      created_at: t.created_at,
      apt_nm: t.bridge_name ?? null,
      dong: null,
      lat: null, lng: null,
      author_id: t.payer_id,
      author_name: t.payer_name,
      author_link: null,
      author_is_paid: false, author_is_solo: false,
      author_avatar_url: null, author_apt_count: null,
      bridge_name: t.bridge_name,
      bridge_toll_amount: Number(t.amount),
      bridge_payer_name: t.payer_name,
      bridge_owner_name: t.owner_name,
    } as FeedItem));

    // 거래성사 → FeedItem (kind 'sell_complete')
    const sellItems: FeedItem[] = sellRows.map((s) => {
      const am = s.apt_master ?? null;
      const aptLabel = am?.apt_nm ? (am.dong ? `${am.dong} ${am.apt_nm}` : am.apt_nm) : '단지';
      const price = Number(s.actor_score ?? 0);
      const isSnatch = price === 0;
      return {
        kind: 'sell_complete' as const,
        id: 700000 + s.id,
        apt_master_id: s.apt_id,
        post_id: null,
        title: '🤝 거래성사',
        content: isSnatch
          ? `${s.prev_occupier_name ?? '이전점거자'} → ${s.actor_name ?? '신규점거자'} | ${aptLabel} | 내놔 (무상)`
          : `${s.prev_occupier_name ?? '매도인'} → ${s.actor_name ?? '매수인'} | ${aptLabel} | ${price.toLocaleString()} mlbg`,
        created_at: s.created_at,
        apt_nm: am?.apt_nm ?? null,
        dong: am?.dong ?? null,
        lat: am?.lat ?? null,
        lng: am?.lng ?? null,
        author_id: s.actor_id,
        author_name: s.actor_name,
        author_link: null,
        author_is_paid: false, author_is_solo: false,
        author_avatar_url: null, author_apt_count: null,
        sell_price: price,
        sell_buyer_name: s.actor_name,
        sell_seller_name: s.prev_occupier_name,
      } as FeedItem;
    });

    // 경매는 강제 최상단 유지. 사이트 공지·일반·입찰·이마트·공장·파업·통행료·거래성사 모두 시간순.
    const others = [...NOTICE_ITEMS, ...announcementItems, ...discussionItems, ...commentItems, ...postItems, ...postCommentItems, ...listingItems, ...offerItems, ...bidItems, ...emartItems, ...factoryItems, ...facilityCommentItems, ...strikeItems, ...tollItems, ...sellItems]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100 - auctionItems.length);
    return [...auctionItems, ...others];
}

// 30초 캐싱. mutation (글/댓글/매물 등) 시 클라이언트가 /api/revalidate-home 호출 → revalidateTag('home-feed') 로 즉시 무효화.
const fetchFeed = unstable_cache(fetchFeedRaw, ['home-feed-v1'], { revalidate: 30, tags: ['home-feed'] });

export default async function HomePage({ searchParams }: { searchParams: Promise<{ view?: string; apt?: string; emart?: string; factory?: string }> }) {
  const sp = await searchParams;
  // 모바일 초기 뷰. URL 쿼리로 결정. 토글은 클라이언트에서 pushState + popstate (서버 RTT 0).
  const initialView = (sp.view === 'map' || !!sp.apt || !!sp.emart || !!sp.factory) ? 'map' : 'feed';
  const feed = await fetchFeed();

  return (
    <Layout current="home">
      <HomeMobileSwitcher feed={feed} initialView={initialView} />
    </Layout>
  );
}
