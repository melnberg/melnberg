import { NextRequest, NextResponse } from 'next/server';
// import Anthropic from '@anthropic-ai/sdk'; // ← Claude → GPT-5-mini로 교체 (2026-05)
import { createClient } from '@/lib/supabase/server';
import { embedTexts, getOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 시세 view 캐시 — 모듈 스코프, TTL 10분
// 적재는 일/주 단위로만 일어나므로 10분 캐시는 안전
type PriceRow = { apt_nm: string; umd_nm: string; lawd_cd: string; area_group: number; trade_count: number; median_amount: number; window_used: string; last_deal_date: string };
let priceCache: { rows: PriceRow[]; expiresAt: number } | null = null;
const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;

// ─── 시군구·호선 매핑 ─────────────────────────
// 사용자 질문에서 지역 키워드 → 시군구 LAWD_CD 리스트로 변환
const SGG_NAME_TO_CD: Record<string, string> = {
  // 서울
  '종로': '11110', '종로구': '11110',
  '중구': '11140',
  '용산': '11170', '용산구': '11170',
  '성동': '11200', '성동구': '11200',
  '광진': '11215', '광진구': '11215',
  '동대문': '11230', '동대문구': '11230',
  '중랑': '11260', '중랑구': '11260',
  '성북': '11290', '성북구': '11290',
  '강북': '11305', '강북구': '11305',
  '도봉': '11320', '도봉구': '11320',
  '노원': '11350', '노원구': '11350',
  '은평': '11380', '은평구': '11380',
  '서대문': '11410', '서대문구': '11410',
  '마포': '11440', '마포구': '11440',
  '양천': '11470', '양천구': '11470',
  '강서': '11500', '강서구': '11500',
  '구로': '11530', '구로구': '11530',
  '금천': '11545', '금천구': '11545',
  '영등포': '11560', '영등포구': '11560',
  '동작': '11590', '동작구': '11590',
  '관악': '11620', '관악구': '11620',
  '서초': '11650', '서초구': '11650',
  '강남': '11680', '강남구': '11680',
  '송파': '11710', '송파구': '11710',
  '강동': '11740', '강동구': '11740',
  // 인천
  '인천': '28', // prefix 매칭
  // 경기 핵심
  '분당': '41135', '분당구': '41135',
  '판교': '41135', // 판교는 분당구 소속
  '수정구': '41131', '중원구': '41133',
  '고양': '41281', '덕양': '41281', '일산동': '41285', '일산서': '41287',
  '용인': '41463', '수지': '41467', '기흥': '41465', '처인': '41463',
  '수원': '41117', '영통': '41117', '팔달': '41115', '권선': '41113', '장안': '41111',
  '성남': '41131',
  '안양': '41173', '동안구': '41173',
  '부천': '41192',
  '광명': '41210',
  '평택': '41220',
  '의정부': '41150',
  '하남': '41450',
  '과천': '41290',
  '구리': '41310',
  '남양주': '41360',
  '시흥': '41390',
  '군포': '41410',
  '의왕': '41430',
  '파주': '41480',
  '김포': '41570',
};

// 지하철 호선별 서울·경기 시군구 (대략적, 주요 역세권 위주)
const SUBWAY_LINE_TO_SGG: Record<string, string[]> = {
  '1호선': ['11110', '11140', '11230', '11290', '11320', '11350', '11530', '11560', '11545', '11680', '28200', '41281', '41220'],
  '2호선': ['11140', '11200', '11215', '11230', '11290', '11440', '11530', '11560', '11590', '11620', '11650', '11680', '11710'],
  '3호선': ['11110', '11140', '11410', '11650', '11680', '11290', '11380', '41135'],
  '4호선': ['11110', '11140', '11290', '11305', '11320', '11350', '11650', '11710'],
  '5호선': ['11110', '11140', '11200', '11215', '11440', '11470', '11500', '11560', '11590', '11650', '11680', '11710', '11740'],
  '6호선': ['11170', '11200', '11260', '11290', '11380', '11440'],
  '7호선': ['11215', '11260', '11305', '11320', '11350', '11500', '11540', '11590', '11650', '11680', '11710'],
  '8호선': ['11710', '11740', '41131', '41450'],
  '9호선': ['11170', '11440', '11500', '11560', '11590', '11650', '11680', '11710'],
  '신분당선': ['11650', '11680', '41135', '41467'],
};

function extractPriceRange(question: string): { min: number; max: number } | null {
  // 만원 단위 (1억 = 10000)
  // "X억대" → (X-1) ~ (X+1) 억 (사용자 의도: 12억대 = 11~13억 범위)
  const dae = question.match(/(\d{1,3})\s*억\s*대/);
  if (dae) {
    const x = Number(dae[1]);
    return { min: Math.max(0, (x - 1) * 10000), max: (x + 1) * 10000 };
  }
  // "X억 이하" / "X억 미만" / "X억 이내"
  const ihaa = question.match(/(\d{1,3})\s*억\s*(이하|미만|이내)/);
  if (ihaa) {
    return { min: 0, max: Number(ihaa[1]) * 10000 };
  }
  // "X억 이상" / "X억 초과"
  const isang = question.match(/(\d{1,3})\s*억\s*(이상|초과)/);
  if (isang) {
    return { min: Number(isang[1]) * 10000, max: 999_999_999 };
  }
  // "X~Y억" / "X억~Y억" / "X에서 Y억"
  const range = question.match(/(\d{1,3})\s*억?\s*[~\-에서]+\s*(\d{1,3})\s*억/);
  if (range) {
    const x = Number(range[1]); const y = Number(range[2]);
    return { min: Math.min(x, y) * 10000, max: Math.max(x, y) * 10000 };
  }
  // "X억" 단독 — loose ±1억
  const exact = question.match(/(\d{1,3})\s*억(?!\s*(짜리|기준))/);
  if (exact) {
    const x = Number(exact[1]);
    return { min: Math.max(0, (x - 1) * 10000), max: (x + 1) * 10000 };
  }
  return null;
}

function extractRegions(question: string): { lawdCds: Set<string> } {
  const cds = new Set<string>();

  // 시군구명 매칭
  for (const [name, cd] of Object.entries(SGG_NAME_TO_CD)) {
    if (question.includes(name)) {
      // '인천' 같은 prefix는 28로 시작하는 모든 시군구 추가
      if (cd === '28') {
        ['28110', '28140', '28177', '28185', '28200', '28237', '28245', '28260'].forEach((c) => cds.add(c));
      } else {
        cds.add(cd);
      }
    }
  }

  // 호선 매칭
  for (const [line, sggs] of Object.entries(SUBWAY_LINE_TO_SGG)) {
    if (question.includes(line)) {
      sggs.forEach((c) => cds.add(c));
    }
  }

  return { lawdCds: cds };
}

// 단지명 fuzzy 매칭 — corpus에 단지명의 핵심 토큰이 있으면 매칭
// 카페 글이 "압구정 현대2차"로 부르고 시세 view엔 "현대2차(10,11,20,23,24,25동)"로 적힌 경우 등 처리
function aptInCorpus(aptNm: string, corpus: string): boolean {
  if (!aptNm || aptNm.length < 4) return false;
  if (corpus.includes(aptNm)) return true;
  // 1) 괄호 안 내용 제거 후 매칭 (예: "현대2차(10,11동)" → "현대2차")
  const stripped = aptNm.replace(/\([^)]*\)/g, '').trim();
  if (stripped.length >= 4 && corpus.includes(stripped)) return true;
  // 2) 공백·괄호·· 으로 토큰 분리. 가장 긴 토큰(4자 이상)이 corpus에 있으면 매칭
  const tokens = aptNm.split(/[\s()\[\]·,]+/).filter((t) => t.length >= 4);
  return tokens.some((t) => corpus.includes(t));
}

type ChunkRow = {
  chunk_id: number;
  post_id: number;
  chunk_content: string;
  similarity: number;
  post_title: string;
  external_url: string | null;
  posted_at: string | null;
};

const KEYWORD_STOPWORDS = new Set([
  '어떤', '어디', '언제', '얼마', '얼마나', '몇', '왜',
  '뭐', '뭘', '뭐임', '뭐지', '뭔지', '무엇', '무슨',
  '어떻게', '어떡해', '누구', '누가',
  '있나', '있나요', '있어요', '있음', '있는', '있어',
  '없나', '없나요', '없어요', '없음', '없는',
  '관련', '대해', '대한', '동네', '곳', '지역', '쪽',
  '알려줘', '알려', '추천', '설명', '말해', '말해줘', '알고',
  '같은', '같이', '같음', '함께', '제일', '가장', '많이', '조금',
  '하는', '하나', '한번', '하기',
  '되나', '되는', '될까', '돼',
  '있고', '없고', '입니까', '인가요', '입니다',
  '이거', '저거', '그거', '여기', '거기', '저기', '그게', '이게',
]);

const PARTICLE_REGEX = /(은|는|이|가|을|를|의|에|에서|에서는|에서도|로|으로|부터|까지|와|과|도|만|이라|이라고|라고|랑|이랑|에게|한테|이고|이며|이지)$/;

function formatSearchResults(rows: ChunkRow[]): string {
  if (rows.length === 0) return '';
  return rows.map((c, i) => {
    const score = c.similarity;
    const relevance = score >= 0.8 ? '높음' : score >= 0.6 ? '중간' : '낮음';
    const dateStr = c.posted_at ? c.posted_at.slice(0, 10) : '날짜 미상';
    // 제목 앞 [태그] → 카테고리, 본문 제목은 태그 제거
    const catMatch = c.post_title.match(/^\[([^\]]+)\]\s*/);
    const category = catMatch ? catMatch[1] : '일반';
    const cleanTitle = c.post_title.replace(/^\[[^\]]+\]\s*/, '');
    return [
      `[참고 자료 ${i + 1}]`,
      `제목: ${cleanTitle}`,
      `카테고리: ${category}`,
      `작성일: ${dateStr}`,
      `관련도: ${relevance} (score ${score.toFixed(2)})`,
      `본문:`,
      c.chunk_content,
    ].join('\n');
  }).join('\n\n---\n\n');
}

function extractKeywords(question: string): string[] {
  const tokens = question
    .replace(/[?!.,()\[\]{}'":\-_/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of tokens) {
    let word = raw.replace(PARTICLE_REGEX, '');
    if (word.length < 2) continue;
    if (/^\d+$/.test(word)) continue;
    if (KEYWORD_STOPWORDS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
  }
  return keywords.slice(0, 6);
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: '질문을 입력해주세요.' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. 로그인 여부 확인 (비회원도 IP 한도 내에서 허용)
    const { data: { user } } = await supabase.auth.getUser();

    let dailyLimit: number;
    let limitLabel: string;
    let limitErr: { message?: string } | null = null;
    let limitResult: { blocked?: boolean; used_today?: number; daily_limit?: number; log_id?: number } | undefined;
    let logId: number | null = null;

    // 관리자는 무제한, 그 외 모두 일일 5회 (로그인이든 비로그인이든)
    dailyLimit = 5;
    limitLabel = '일일';
    let isAdmin = false;

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle();
      isAdmin = !!profile?.is_admin;
    }

    if (isAdmin) {
      // 관리자는 한도 검사 스킵
    } else if (user) {
      const res = await supabase.rpc('check_and_log_ai_question', {
        q_user_id: user.id,
        q_question: question.trim(),
        q_daily_limit: dailyLimit,
      });
      limitErr = res.error;
      limitResult = Array.isArray(res.data) ? res.data[0] : res.data;
    } else {
      const ip = (
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown'
      );
      const res = await supabase.rpc('check_and_log_ai_question_ip', {
        q_ip: ip,
        q_question: question.trim(),
        q_daily_limit: dailyLimit,
      });
      limitErr = res.error;
      limitResult = Array.isArray(res.data) ? res.data[0] : res.data;
    }

    if (limitErr) {
      console.warn('AI question limit RPC unavailable, skipping limit:', limitErr.message);
    } else if (limitResult?.blocked) {
      return NextResponse.json(
        { error: `${limitLabel} 한도(${dailyLimit}회) 도달함. 내일 다시 시도해주세요. 흑흑...` },
        { status: 429 },
      );
    } else if (limitResult?.log_id) {
      logId = limitResult.log_id;
    }

    const _t0 = Date.now();
    const [queryEmbedding] = await embedTexts([question.trim()]);
    const _tEmbed = Date.now();
    const keywords = extractKeywords(question.trim());

    // 카페 검색 + 시세 view 동시 호출 (둘은 서로 독립적이라 병렬 가능)
    const searchPromise = supabase.rpc('search_cafe_chunks_hybrid', {
      query_embedding: queryEmbedding as unknown as string,
      keywords,
      match_count: 10,
    });

    // 시세 view 캐시 hit이면 promise 즉시 resolve
    const cachedPrice = priceCache && priceCache.expiresAt > Date.now() ? priceCache.rows : null;
    const pricePromise: Promise<{ data: PriceRow[] | null }> = cachedPrice
      ? Promise.resolve({ data: cachedPrice })
      : (supabase
          .from('apt_representative_price')
          .select('apt_nm, umd_nm, lawd_cd, area_group, trade_count, median_amount, window_used, last_deal_date') as unknown as Promise<{ data: PriceRow[] | null }>);

    const [searchRes, priceRes] = await Promise.all([searchPromise, pricePromise]);

    let chunks: ChunkRow[] | null = (searchRes.data as ChunkRow[] | null) ?? null;
    const searchError = searchRes.error;

    // 폴백: 하이브리드 RPC가 아직 DB에 없으면 기존 벡터-only RPC로
    if (searchError) {
      console.warn('Hybrid RPC not available, falling back to vector-only:', searchError.message);
      const res = await supabase.rpc('search_cafe_chunks', {
        query_embedding: queryEmbedding as unknown as string,
        match_count: 15,
      });
      if (res.error) {
        console.error('Vector search error:', res.error);
        return NextResponse.json({ error: '검색 중 오류가 발생했습니다.' }, { status: 500 });
      }
      chunks = (res.data as ChunkRow[] | null) ?? null;
    }

    const _tSearch = Date.now();
    const rows = (chunks ?? []) as ChunkRow[];

    // ─── 시세 보조 컨텍스트 (priceRes로부터) ───────────────
    // 두 가지 매칭 경로를 합침:
    //   1) 직접 필터: 질문에서 가격대·지역 추출 → 조건 맞는 단지 (가격대·지역 질문에 핵심)
    //   2) 카페 코퍼스 매칭: 검색된 카페 글에 등장한 단지 (정성적 추천 보조)
    let priceContext = '';
    try {
      const priceRows: PriceRow[] | null = (priceRes.data as PriceRow[] | null) ?? [];
      if (!cachedPrice && priceRows) {
        priceCache = { rows: priceRows, expiresAt: Date.now() + PRICE_CACHE_TTL_MS };
      }

      if (priceRows && priceRows.length > 0) {
        const q = question.trim();
        const priceRange = extractPriceRange(q);
        const { lawdCds } = extractRegions(q);
        const corpus = rows.map((r) => `${r.post_title} ${r.chunk_content}`).join(' ');

        // 카페 코퍼스에 등장하는 단지만 추천 대상.
        // 가격·지역 조건은 그 위에 추가 필터로만 작동 (조건 안 맞으면 제외).
        const cafeMatched: PriceRow[] = [];
        let priceOnlyCount = 0;

        for (const p of priceRows) {
          if (!p.apt_nm || p.apt_nm.length < 4) continue;
          const isCafe = aptInCorpus(p.apt_nm, corpus);
          const priceOk = !priceRange || (p.median_amount >= priceRange.min && p.median_amount <= priceRange.max);
          const regionOk = lawdCds.size === 0 || lawdCds.has(p.lawd_cd);

          if (isCafe && priceOk && regionOk) {
            cafeMatched.push(p);
          } else if (!isCafe && priceOk && regionOk && (priceRange || lawdCds.size > 0)) {
            // 카페엔 없지만 가격·지역 조건만 맞는 단지 → 통계로만 카운트
            priceOnlyCount++;
          }
        }

        // 카페 매칭 단지 정렬: 거래량 많은 순
        cafeMatched.sort((a, b) => b.trade_count - a.trade_count);
        const slicedCafe = cafeMatched.slice(0, 30);

        if (slicedCafe.length > 0 || priceOnlyCount > 0) {
          const filterDesc = [];
          if (priceRange) filterDesc.push(`가격: ${(priceRange.min / 10000).toFixed(0)}~${(priceRange.max / 10000).toFixed(0)}억`);
          if (lawdCds.size > 0) filterDesc.push(`지역: 시군구 ${lawdCds.size}개 매칭`);
          const filterLine = filterDesc.length > 0 ? `\n질문에서 추출된 조건: ${filterDesc.join(', ')}` : '';

          let block = `\n\n[참고 시세 — 추천 대상 단지의 현재 시세]\n`;
          block += `규칙: 카페에서 다룬 단지 중 사용자 조건(가격·지역) 맞는 것만 표시. 답변에 등장할 수 있는 단지는 이 목록뿐.\n`;
          block += `산출 정책: 최근 2개월 평균 → 거래 부족 시 3개월 → 6개월 순으로 확장. 직거래·해제거래·1층 제외.${filterLine}\n`;

          if (slicedCafe.length > 0) {
            const lines = slicedCafe.map((p) => {
              const eok = (p.median_amount / 10000).toFixed(1);
              return `- ${p.apt_nm} (${p.umd_nm}) ${p.area_group}㎡대: 약 ${eok}억 (${p.window_used} 평균, ${p.trade_count}건, 마지막 거래 ${p.last_deal_date})`;
            });
            block += lines.join('\n');
          } else {
            block += '(카페에서 다룬 단지 중 조건에 맞는 단지 없음)';
          }

          if (priceOnlyCount > 0) {
            block += `\n\n[참고 통계 — 답변에 단지명 등장 금지]\n사용자 조건에 들어오는 단지는 카페에서 다루지 않은 것까지 포함해 약 ${priceOnlyCount}개 더 있음. 다만 카페에서 평가하지 않은 단지는 추천 대상이 아니므로 답변에 단지명·시세를 절대 쓰지 말 것. 답변 끝에 "이 외에도 가격 조건에 맞는 단지가 더 있지만, 멜른버그에서 다루지 않은 단지라 별도 임장·조사가 필요합니다" 정도로만 안내 가능.`;
          }
          priceContext = block;
        }
      }
    } catch (e) {
      console.warn('price context build failed:', e instanceof Error ? e.message : e);
    }
    const _tPrice = Date.now();

    // 출처 — 관련도 높은 청크만 (similarity > 0.5), 글 단위 dedup, top 6개로 제한
    // 키워드 매치는 0.9+, 벡터 매치 중 강한 것만 유지
    const relevantChunks = rows.filter((c) => c.similarity > 0.5);
    const sourceMap = new Map<number, { id: number; title: string; url: string | null; similarity: number }>();
    for (const c of relevantChunks) {
      const existing = sourceMap.get(c.post_id);
      if (!existing || existing.similarity < c.similarity) {
        sourceMap.set(c.post_id, { id: c.post_id, title: c.post_title, url: c.external_url, similarity: c.similarity });
      }
    }
    const sources = Array.from(sourceMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 6)
      .map(({ id, title, url }) => ({ id, title, url }));

    // 검색 결과 개수를 로그에 업데이트 (자료없음 추적용)
    if (logId) {
      await supabase.rpc('update_ai_log_results', {
        q_log_id: logId,
        q_chunk_count: rows.length,
        q_source_count: sources.length,
      }).then(() => {}, (e) => console.warn('update_ai_log_results failed:', e?.message));
    }

    const context = formatSearchResults(rows);

    const corePrompt = [
      '당신은 부동산 개인 상담사입니다. 검색엔진도, 카페 자료 요약 봇도 아닙니다.',
      '사용자에게 직접 의견을 들려주는 친절하고 단호한 상담사입니다.',
      '',
      '【가장 우선하는 절대 금지: 별표 두 개 (** ) 패턴】',
      '답변 본문 어디에도 "**" 문자열이 등장하면 안 됩니다. 강조 목적으로도, 굵게 표시 목적으로도, 단지명 강조 목적으로도, 어떤 이유로도 ** 사용 금지입니다.',
      '강조는 마크다운 헤딩 (## / ###) 으로만 가능합니다. 본문 텍스트에서는 평문으로만 작성하세요.',
      '예시 — 절대 하지 말 것:',
      '  나쁜 예: 단지를 실거주 목적으로 본다면 **1단지·2단지의 특정 호수**는 추천합니다.',
      '  좋은 예: 단지를 실거주 목적으로 본다면 1단지·2단지의 특정 호수(초등학교 배정권, 역 접근 유리한 동·층)는 추천합니다.',
      '  나쁜 예: **계절성**: 집값은 6개월 오르고 6개월 쉬는 패턴이에요.',
      '  좋은 예: 계절성 — 집값은 6개월 오르고 6개월 쉬는 패턴이에요. (또는 그냥 "계절성: 본문")',
      '리스트 항목의 리드 단어도 ** 없이 그냥 "단어: 본문" 또는 "단어 — 본문" 형태로만 작성합니다.',
      '',
      '【규칙 0 — 데이터 출처 분리 (정보 신뢰도의 핵심)】',
      '두 개의 데이터 소스가 시스템에 첨부됩니다. 각각 용도가 완전히 다릅니다.',
      '',
      '  A) [참고 자료] (카페 글 청크): 멜른버그 카페의 분석·관점·평가. 작성 시점 기준이라 가격은 옛날.',
      '     → 이 데이터는 오직 "추천/비추천 판단", "단지 평가", "지역 서열", "함정단지 여부" 같은 정성적 의견에만 사용합니다.',
      '     → 이 데이터에 적힌 가격 숫자(예: "5억", "10억대", "30억까지 갔다")는 절대 답변에 옮기지 않습니다. 옛날 시세라 사용자 신뢰도를 망칩니다.',
      '',
      '  B) [참고 시세] (국토부 실거래가 view, 최근 6개월 중앙값): 현재 시세.',
      '     → 답변에 등장하는 모든 가격 숫자는 반드시 이 블록에서만 가져옵니다.',
      '     → 단지가 [참고 시세]에 없으면 그 단지의 가격은 답변에 절대 쓰지 않습니다. "최근 실거래 데이터가 부족해서 가격은 직접 확인이 필요해요" 식으로 명시합니다.',
      '',
      '왜 중요한가: 사용자 질문의 80%는 "OO억대 추천" / "OO억으로 어디 살까" 같은 가격 기반 질문입니다.',
      '카페 글의 옛 가격을 그대로 답하면 "10억대"라고 추천한 단지가 실제론 21억일 수 있고, 그 순간 답변 신뢰도는 급격히 무너집니다.',
      '',
      '실전 적용 패턴:',
      '  - 추천 단지 선정 → A(카페)에서 카페가 어느 단지를 추천했는지 확인',
      '  - 그 단지가 사용자 가격대에 맞는지 → B(실거래)에서 median_amount 확인',
      '  - 둘 다 만족하는 단지만 답변에 등장. 한쪽만 만족하면 제외하거나 명시 (예: "카페에서 추천하지만 지금은 ~억대라 범위 밖이에요").',
      '',
      '!!! 절대 규칙 — 카페 미수록 단지 등장 금지 !!!',
      '[참고 시세] 블록은 두 영역으로 나뉠 수 있습니다:',
      '  1) "[참고 시세 — 추천 대상 단지의 현재 시세]" → 답변에 등장 가능한 유일한 단지 목록',
      '  2) "[참고 통계 — 답변에 단지명 등장 금지]" → 답변에 단지명·시세 절대 등장 X. 통계 안내만 가능.',
      '두 번째 영역의 단지는 카페에서 평가하지 않은 단지입니다. 답변에 그 단지명을 등장시키면 신뢰도가 무너집니다.',
      '예: 답변에 "CS타워" 같이 카페에 안 다뤄진 단지를 추천하면 안 됩니다.',
      '카페에서 다룬 단지 중 조건 맞는 게 없으면 솔직히 "조건에 맞는 단지를 카페가 다루지 않아 정확한 추천이 어렵습니다" 라고 답하고, 카페에 없는 단지를 가져와 채우지 마세요.',
      '',
      '【규칙 1 — 출처 호명·메타 표현 절대 금지】',
      '아래 표현은 답변에 한 번도 등장하면 안 됩니다 (한 단어라도 섞으면 답변 실패):',
      '  "멜른버그", "멜른버그에서", "멜른버그에 따르면", "멜른버그 관점에서는", "멜른버그에서의 평가는"',
      '  "카페", "카페 글", "카페 글에서는", "카페 분석", "카페 정리 글"',
      '  "참고 자료", "주주서한", "첫집마련 시리즈", "정리 글"',
      '  "~에서 언급돼 있어요", "~에서 권하고 있습니다", "~에서 분류됨", "~에서 보라고 하고 있어요"',
      '  "근거와 맥락을 정리하면", "결론적으로", "정리하자면", "다음과 같습니다"',
      '왜? 사용자는 검색 결과 요약을 원하지 않습니다. 상담사가 직접 의견을 주는 자연스러운 대화를 원합니다.',
      '참고 자료는 당신의 머릿속 지식이라 생각하고, 자기 분석처럼 직접 단정하세요. "도곡렉슬은 강남권에서 안정적인 수요를 가진 단지예요" 라고 자기 의견으로 말합니다.',
      '',
      'BAD vs GOOD 출처 호명 예시:',
      '  BAD:  "멜른버그에서는 도곡렉슬을 1순위로 봅니다."',
      '  GOOD: "도곡렉슬을 1순위로 추천드려요."',
      '  BAD:  "카페 글에서 분당이 안정적이라고 분석돼 있어요."',
      '  GOOD: "분당은 안정적인 권역이에요."',
      '  BAD:  "근거와 맥락을 간단히 정리하면 다음과 같습니다."',
      '  GOOD: (이 문장 자체를 쓰지 말고 그냥 다음 내용으로 자연스럽게 이어집니다)',
      '  BAD:  "주주서한에서 짚어준 대로 ~"',
      '  GOOD: "~예요" (출처 표시 없이 자기 의견처럼)',
      '',
      '【규칙 2 — 존댓말 + 구어체 상담사 톤】',
      '1. 답변은 반드시 존댓말(해요체/습니다체)로만 작성합니다. 모든 문장의 끝이 "~예요", "~해요", "~입니다", "~합니다" 중 하나여야 합니다.',
      '2. 음슴체 절대 금지: "~함", "~임", "~음", "~봐라", "~할 것", "~해야 함" 같은 어미는 단 한 번도 쓰지 않습니다.',
      '3. 반말 절대 금지: "~야", "~거든", "~지", "~네", "~봐", "~해" 같은 반말 어미도 쓰지 않습니다.',
      '4. 보고서·논문체 금지: "근거와 맥락은 다음과 같습니다", "주의점은 다음과 같습니다", "결론적으로", "정리하자면" 같은 문구 금지. 친구 같은 상담사가 차분히 말해주는 톤으로 자연스럽게 풀어서.',
      '',
      'BAD vs GOOD 어미·구어체 예시:',
      '  BAD:  "분당 시범단지를 우선 추천함. 학군이 강하다고 평가됨."',
      '  GOOD: "분당 시범단지를 먼저 추천드려요. 학군이 워낙 강한 곳이에요."',
      '  BAD:  "임장해 봐라. 이 구도로 보라고 정리하고 있음."',
      '  GOOD: "임장 한 번 다녀와 보세요. 이 구도로 보시는 게 좋아요."',
      '  BAD:  "수요가 견인된다고 분석하고 있음."',
      '  GOOD: "수요가 탄탄해서 가격 방어가 잘 되는 단지예요."',
      '',
      '답변 원칙:',
      '1. 제공된 참고 자료를 기반으로 답변하되, 직접적인 단어 일치가 아니어도 주제적·맥락적으로 관련 있으면 활용해서 답변할 것.',
      '2. 참고 자료의 내용을 종합·해석·연결해서 답변해도 됨. 단, 자료에 없는 새로운 사실(가격, 규제, 데이터)은 만들어내지 말 것.',
      '3. 자료에서 직접 답이 안 나오면 "정확한 답은 없지만, 관련해서 이런 관점이 있음"이라고 부분 답변을 시도할 것.',
      '4. "관련 내용이 없습니다"는 진짜 자료가 전혀 무관할 때만 사용.',
      '',
      '[답변 톤 — 매우 중요]',
      '- 존댓말만 사용. 해요체("~해요", "~예요") 또는 습니다체("~합니다", "~입니다") 둘 중 하나로 일관되게.',
      '  예: "이쪽이 더 나아 보여요", "GTX 호재가 큰 영향이에요", "상황 보면 이런 흐름이 나옵니다"',
      '- 반말("~야", "~거든", "~지", "~네") 사용 절대 금지.',
      '- 음슴체("~함", "~임", "~음") 사용 절대 금지.',
      '- 톤은 차분하고 단정적인 전문가 조언. 과도하게 친절하지 않고, 핵심만 단호하게.',
      '',
      '[답변 즉답 규칙]',
      '- 카페 글 요약·나열 금지. 여러 글을 통합·해석해서 하나의 매끄러운 답변으로.',
      '- 인사·서론·재확인 절대 금지. "분당 아파트 찾고 계시는군요", "좋은 질문이에요" 같은 도입부 X. 답변 맨 위 ## 큰 제목 다음부터 바로 본론.',
      '- 되묻기 금지. "예산이 어떻게 되세요?", "원하시는 평형 알려주세요" 같은 클로저 X. 사용자가 정보 적게 줘도 합리적 가정으로 즉시 답합니다. 한 질문 = 하나의 완결된 답변.',
      '- 마무리 문장에 "더 알려드릴까요?" "조건 알려주세요" 류 클로저 X. 결론 섹션이 곧 답변의 끝입니다.',
      '- 단지 이름이 빠지면 답변이 아닙니다. 추상적인 "분당이 좋아요"가 아니라 구체 단지를 박아 답합니다.',
      '',
      '[답변 양식 — 구조 강제]',
      '- 답변은 다음 골격으로 작성합니다 (단답이 적절한 짧은 질문은 예외):',
      '  1) 답변 맨 위에 답변 전체를 한 줄로 표현하는 큰 제목을 마크다운 ## 로. 예: ## 매수 타이밍 판단',
      '  2) 본문은 2~4개의 섹션으로 분할하고 각 섹션 제목은 마크다운 ### 로. 예: ### 기다리는 것의 비용 / ### 지금이 사야 할 시기인 이유 / ### 매수 판단 기준',
      '  3) 마지막 섹션 제목은 반드시 ### 결론 으로 닫고 1~3 문장으로 단정적인 결론을 줍니다.',
      '  4) 섹션 안 본문은 자연스러운 문단 서술 또는 불릿/번호 목록 (병렬 항목일 때).',
      '',
      '[강조 처리 — 마크다운 헤딩만 허용]',
      '- 본문 텍스트에 별표 두 개(** ) 사용 절대 금지. 위 「가장 우선하는 절대 금지」 규칙에 따라 어떤 이유로도 ** 쓰지 않습니다.',
      '- 이탤릭(*...*)도 사용 금지.',
      '- 강조는 헤딩 (## 큰 제목, ### 섹션 제목) 으로만 합니다. 헤딩이 자동으로 굵고 큰 글자로 렌더링됩니다.',
      '',
      '양식 예시 (참고 — 본문에 ** 한 번도 쓰지 않음에 주목):',
      '  ## 매수 타이밍 판단',
      '  ### 기다리는 것의 비용',
      '  자산을 보유하지 않는 것 자체가 손실이에요. (생략) ...',
      '  ### 지금이 사야 할 시기인 이유',
      '  - 계절성: 집값은 6개월 오르고 6개월 쉬는 패턴이에요.',
      '  - 분양권 데드라인 — 2025년 10월 이후 분양 단지는 전매제한 3년으로 강화됐습니다.',
      '  ### 결론',
      '  기다릴수록 유리한 시장이 아니에요. 지금 살 수 있는 최선의 물건을 사는 것이 원칙입니다.',
      '',
      '[당신의 정체성 — 매우 중요]',
      '- 당신은 개인 부동산 상담사입니다. 검색 엔진이나 자료 요약 봇이 아닙니다.',
      '- 답변할 때 "멜른버그에 따르면", "멜른버그에서의 평가는", "멜른버그 관점에서는", "카페 글에서는", "카페 분석 보면" 같은 출처 호명 표현을 절대 쓰지 마세요. 한 번도 쓰면 안 됩니다.',
      '- 참고 자료는 당신의 머릿속 지식이라고 생각하고, 자기 의견처럼 그냥 말합니다. "도곡렉슬은 강남권에서 안정적인 수요를 가진 단지예요" 라고 직접 단정하면 됩니다.',
      '- 카페 글의 분석을 자기 분석처럼 자연스럽게 녹여서 말합니다. 글 제목·작성자·시리즈명을 답변에 등장시키지 마세요.',
      '',
      '[추천/비추천 명확 구분]',
      '- 사라/사지마를 명확히 갈라서 답합니다. 추천 단지는 "~를 추천합니다" / "~가 1순위예요". 비추 단지는 "~는 사지 마세요" / "차라리 X를 보세요".',
      '- "장점도 있고 단점도 있어요" / "케이스 바이 케이스" / "본인 상황에 따라 달라요" 같은 양다리 답변 절대 금지.',
      '- 비교 질문(A vs B)이면 둘 중 하나를 단정적으로 선택. 둘 다 별로면 "둘 다 비추, 차라리 C를 보세요".',
      '',
      '[자신있는 결론 — 두루뭉술 금지]',
      '- 모든 답변은 명확한 결론으로 끝냅니다. "좋아요/안 좋아요", "추천/비추천", "차라리 X를 보세요" 같이 단정적으로.',
      '- 자료가 모자라면 그 사실을 명시: "이 부분은 정확한 결론이 안 나옵니다 — 추가 자료가 필요해요".',
      '',
      '[최근 시세 인용 — 카페 분석 시점 보정]',
      '- 카페 글의 가격 정보는 작성 시점 기준이라 현재 시세와 크게 다를 수 있어요. 카페 글에 적힌 "10억대", "5억" 같은 숫자는 절대 그대로 답변에 인용하지 마세요.',
      '- 답변에 시세 언급이 가능한 경우는 단 하나: 시스템에 첨부된 [참고 시세] 블록에 그 단지가 명시적으로 들어 있을 때만. 그 외엔 시세 숫자 자체를 입에 올리지 않습니다.',
      '- 참고 시세에 단지가 있으면 인용 패턴 예: "최근 거래는 약 30억 선이에요", "지금 실거래 기준으로는 25억 정도예요". 출처 표기("국토부 실거래", "데이터 기준") 같은 부연도 가급적 생략 — 그냥 자기 지식처럼 말합니다.',
      '- 참고 시세에 단지가 없으면: "최근 실거래가 데이터가 아직 없어서 정확한 가격은 직접 확인이 필요해요" 같은 식으로 명시.',
      '',
      '[가격대 추천 질문 — "10억대 추천", "20억 이하 어디?" 류 — 매우 중요]',
      '- 사용자가 가격 범위를 제시한 경우, 현재 실거래가 기준으로 그 범위에 들어가는 단지만 추천합니다.',
      '- 추천 후보는 반드시 [참고 시세]에 등장하는 단지여야 하고, 그 단지의 median_amount가 사용자 요청 범위에 들어와야 합니다.',
      '- 카페 글이 그 단지를 추천했더라도 현재 시세가 범위 밖이면 "지금은 ~억대라 범위 밖이에요"라고 명시하고 추천에서 제외합니다. 절대 카페 시점 가격을 근거로 추천하지 마세요.',
      '- [참고 시세]에 사용자 범위에 맞는 단지가 없을 때 응답 규칙:',
      '  1) [참고 시세]의 단지들이 사용자 요청 가격대보다 훨씬 비싸면 (예: 강남 단지들이 50억대인데 "10억대 추천" 요청) → 시장 자체에 그 가격대가 없습니다. 안내: "강남은 가장 작은 평형도 20억대부터 시작해서 10억대 매물 자체가 거의 없어요. 같은 가격대로 보시려면 동작·서대문·관악 같은 인접 지역이나 수도권 신도시 쪽으로 눈을 돌리는 게 맞습니다." 같은 식으로.',
      '  2) [참고 시세]가 아예 비어있거나 검색 결과 자체가 빈약하면 → "최근 실거래가 데이터가 아직 충분히 적재되지 않은 지역이라 정확한 추천이 어려워요 — 데이터 보강 후 다시 시도 부탁드려요" 라고 솔직히.',
      '  3) 두 케이스 구분이 핵심: 시장에 매물이 없는 거(1)와 데이터가 없는 거(2)는 다른 답변. 1은 "다른 지역을 보세요" 안내, 2는 "데이터 부족" 솔직 고백.',
      '',
      '[형식 보조]',
      '- 마크다운 사용 가능. 단 위 톤 규칙대로 절제해서 사용.',
      '- 이모지·이모티콘 사용 금지 (😊 🎁 등).',
      '- 과도한 친절·아부("~해드릴게요!", "도와드리겠습니다!") 금지. 차분한 전문가 톤 일관 유지.',
    ].join('\n');

    const systemPrompt = context
      ? `${corePrompt}\n\n참고 자료:\n${context}${priceContext}`
      : `${corePrompt}\n\n참고 자료: (검색 결과 없음)\n→ "멜른버그 DB에 관련 내용이 없어요." 한 줄로 답할 것.`;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    }

    // ─── (구) Anthropic Claude 호출 — 2026-05 GPT-5-mini로 교체. 비교용으로 보존.
    // const apiKey = process.env.ANTHROPIC_API_KEY;
    // if (!apiKey) {
    //   return NextResponse.json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    // }
    // const anthropic = new Anthropic({ apiKey });

    const openai = getOpenAI();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`));
        let fullAnswer = '';
        let _tFirstToken = 0;
        const _tBeforeOpenAI = Date.now();
        try {
          // ─── (구) Claude 스트리밍 — 비교용 보존
          // const anthropicStream = anthropic.messages.stream({
          //   model: 'claude-sonnet-4-6',
          //   max_tokens: 4096,
          //   system: systemPrompt,
          //   messages: [{ role: 'user', content: question.trim() }],
          // });
          // for await (const event of anthropicStream) {
          //   if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          //     fullAnswer += event.delta.text;
          //     controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`));
          //   }
          // }

          // ─── (신) OpenAI GPT-5-mini 스트리밍
          const openaiStream = await openai.chat.completions.create({
            model: 'gpt-5-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: question.trim() },
            ],
            stream: true,
            max_completion_tokens: 4096,
            // GPT-5 reasoning 모델: medium 사용 — 답변 깊이·맥락 통합력 확보
            // (latency ~12~15초로 늘지만 'minimal' 시절의 얕은 답변 문제 해소)
            reasoning_effort: 'medium',
          });

          // ** (굵게 마크다운) 강제 제거 — 모델이 가끔 어겨서 streaming delta에서도 잘라냄.
          // 청크 사이에 ** 가 쪼개지는 경우 대비해 직전 마지막 글자가 '*'이면 1자 버퍼링.
          let starBuffer = '';
          for await (const chunk of openaiStream) {
            const raw = chunk.choices?.[0]?.delta?.content ?? '';
            if (!raw) continue;
            if (_tFirstToken === 0) _tFirstToken = Date.now();
            // 직전 청크 끝의 * 와 이번 청크 앞을 합쳐서 처리
            const merged = starBuffer + raw;
            // 마지막 한 글자가 * 면 다음 청크와 합쳐 ** 검사하기 위해 버퍼에 보류
            const endsWithStar = merged.endsWith('*');
            const body = endsWithStar ? merged.slice(0, -1) : merged;
            starBuffer = endsWithStar ? '*' : '';
            const cleaned = body.replace(/\*\*/g, '');
            if (cleaned) {
              fullAnswer += cleaned;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: cleaned })}\n\n`));
            }
          }
          // 마지막 버퍼에 남은 단일 * 한 글자도 정리해서 흘려보냄
          if (starBuffer) {
            fullAnswer += starBuffer;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: starBuffer })}\n\n`));
          }
          const _tDone = Date.now();
          // 단계별 타이밍 로그 — Vercel Functions 로그에서 확인
          console.log('[AI timings]', {
            embed_ms: _tEmbed - _t0,
            search_ms: _tSearch - _tEmbed,
            price_ms: _tPrice - _tSearch,
            openai_first_token_ms: _tFirstToken ? _tFirstToken - _tBeforeOpenAI : null,
            openai_full_ms: _tDone - _tBeforeOpenAI,
            total_ms: _tDone - _t0,
            answer_chars: fullAnswer.length,
          });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        } catch (err) {
          console.error('OpenAI stream error:', err);
          const message = err instanceof Error ? err.message : 'AI 응답 생성 중 오류가 발생했습니다.';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`));
        } finally {
          // 답변 텍스트를 로그에 저장 (close() 전에 끝내야 Vercel 함수가 안 끊김)
          if (logId && fullAnswer) {
            try {
              await supabase.rpc('update_ai_log_answer', {
                q_log_id: logId,
                q_answer: fullAnswer,
              });
            } catch (e) {
              console.warn('update_ai_log_answer failed:', e instanceof Error ? e.message : e);
            }
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('AI route error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
