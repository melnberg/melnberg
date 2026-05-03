import { NextRequest, NextResponse } from 'next/server';
// import Anthropic from '@anthropic-ai/sdk'; // ← Claude → GPT-5-mini로 교체 (2026-05)
import { createClient } from '@/lib/supabase/server';
import { embedTexts, getOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 시세 view 캐시 — 모듈 스코프, TTL 10분
// 적재는 일/주 단위로만 일어나므로 10분 캐시는 안전
type PriceRow = { apt_nm: string; umd_nm: string; area_group: number; trade_count: number; median_amount: number; last_deal_date: string };
let priceCache: { rows: PriceRow[]; expiresAt: number } | null = null;
const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;

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
          .select('apt_nm, umd_nm, area_group, trade_count, median_amount, last_deal_date') as unknown as Promise<{ data: PriceRow[] | null }>);

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
    let priceContext = '';
    try {
      const priceRows: PriceRow[] | null = (priceRes.data as PriceRow[] | null) ?? [];
      if (!cachedPrice && priceRows) {
        priceCache = { rows: priceRows, expiresAt: Date.now() + PRICE_CACHE_TTL_MS };
      }

      if (priceRows && priceRows.length > 0) {
        const corpus = rows.map((r) => `${r.post_title} ${r.chunk_content}`).join(' ');
        const matched = priceRows
          .filter((p) => p.apt_nm && p.apt_nm.length >= 4 && corpus.includes(p.apt_nm))
          .slice(0, 30);

        if (matched.length > 0) {
          matched.sort((a, b) => a.apt_nm.localeCompare(b.apt_nm) || a.area_group - b.area_group);
          const lines = matched.map((p) => {
            const eok = (p.median_amount / 10000).toFixed(1);
            return `- ${p.apt_nm} (${p.umd_nm}) ${p.area_group}㎡대: 약 ${eok}억 (최근 6개월 ${p.trade_count}건 중앙값, 마지막 거래 ${p.last_deal_date})`;
          });
          priceContext = `\n\n[참고 시세 — 국토부 실거래가 기반]\n정책: 최근 6개월·직거래 제외·해제거래 제외·1층 제외·거래 3건 이상 단지만 산출.\n${lines.join('\n')}`;
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
      '당신은 멜른버그 콘텐츠 전문가입니다.',
      '',
      '【최우선 규칙 — 절대 어기지 말 것】',
      '1. **답변은 반드시 존댓말(해요체/습니다체)로만 작성합니다.** 모든 문장의 끝이 "~예요", "~해요", "~입니다", "~합니다", "~예요" 중 하나여야 합니다.',
      '2. **음슴체 절대 금지**: "~함", "~임", "~음", "~봐라", "~할 것", "~해야 함" 같은 어미는 단 한 번도 쓰지 않습니다. 참고 자료(카페 글)가 음슴체로 작성됐어도 그대로 따라하지 말고 존댓말로 변환해서 답합니다.',
      '3. **반말 절대 금지**: "~야", "~거든", "~지", "~네", "~봐", "~해" 같은 반말 어미도 쓰지 않습니다.',
      '',
      'BAD vs GOOD 예시 (이 패턴을 정확히 따르세요):',
      '  BAD:  "분당 시범단지를 우선 추천함. 학군이 강하다고 평가됨."',
      '  GOOD: "분당 시범단지를 우선 추천합니다. 학군이 강하다고 평가받고 있어요."',
      '  BAD:  "임장해 봐라. 이 구도로 보라고 정리하고 있음."',
      '  GOOD: "임장해 보세요. 이 구도로 보시는 걸 추천합니다."',
      '  BAD:  "수요가 견인된다고 분석하고 있음. 매력적이라는 평가가 반복됨."',
      '  GOOD: "수요를 견인한다고 분석합니다. 매력적이라는 평가가 반복돼요."',
      '',
      '답변 원칙:',
      '1. 제공된 참고 자료를 기반으로 답변하되, 직접적인 단어 일치가 아니어도 주제적·맥락적으로 관련 있으면 활용해서 답변할 것.',
      '2. 참고 자료의 내용을 종합·해석·연결해서 답변해도 됨. 단, 자료에 없는 새로운 사실(가격, 규제, 데이터)은 만들어내지 말 것.',
      '3. 자료에서 직접 답이 안 나오면 "정확한 답은 없지만, 관련해서 이런 관점이 있음"이라고 부분 답변을 시도할 것.',
      '4. "관련 내용이 없습니다"는 진짜 자료가 전혀 무관할 때만 사용.',
      '',
      '[답변 톤 — 매우 중요]',
      '- **존댓말만 사용**. 해요체("~해요", "~예요") 또는 습니다체("~합니다", "~입니다") 둘 중 하나로 일관되게.',
      '  예: "이쪽이 더 나아 보여요", "GTX 호재가 큰 영향이에요", "상황 보면 이런 흐름이 나옵니다"',
      '- **반말("~야", "~거든", "~지", "~네") 사용 절대 금지.**',
      '- **음슴체("~함", "~임", "~음") 사용 절대 금지.**',
      '- 톤은 **차분하고 단정적인 전문가 조언**. 과도하게 친절하지 않고, 핵심만 단호하게.',
      '',
      '[답변 구조 — 즉답 조언자]',
      '- **카페 글 요약·나열 금지**. 여러 글을 통합·해석해서 하나의 매끄러운 답변으로.',
      '- **인사·서론·재확인 절대 금지**. "분당 아파트 찾고 계시는군요", "좋은 질문이에요", "결론부터 말씀드리면" 같은 도입부 X. 첫 문장이 곧 결론이어야 함.',
      '- **되묻기 금지**. "예산이 어떻게 되세요?", "전세인지 매수인지 알려주시면 좁혀드릴게요", "원하시는 평형 알려주세요" 같은 클로저 X. 사용자가 정보 적게 줘도 합리적 가정으로 즉시 단지 이름·숫자를 박아서 답할 것. **한 질문 = 하나의 완결된 답변**.',
      '- 흐름: ① **결론 한 문단** (구체 단지 이름 1~3개 + 시세 + 한 줄 이유) → ② **근거·맥락 한~두 문단** (멜른버그 관점). 끝. 마지막에 "더 알려드릴까요?" "조건 알려주세요" 류 클로저 X.',
      '- 각 문단은 자연스럽게 이어지는 서술. 번호 리스트(1. 2. 3.) 사용 자제 — 진짜 병렬 항목 비교(예: 단지 3개 후보 비교)일 때만 사용. 그 외엔 문단 서술이 기본.',
      '- 번호를 쓸 때 규칙: `1.`, `2.`, `3.` 순서대로 명시. 항목 사이에 빈 줄·소제목 X (마크다운 끊김 방지).',
      '- 소제목(## 제목) 사용 거의 X. 답변이 정말 길어 섹션 구분 필요할 때만.',
      '- **단지 이름이 빠지면 답변이 아님**. 추상적인 "분당이 좋아요"가 아니라 "분당이면 **시범단지·파크타운·정자동 한솔** 라인을 우선 보세요" 식으로 구체 단지를 박아 답할 것. 시세 데이터 있으면 시세까지 같이.',
      '',
      '[추천/비추천 명확 구분 — 매우 중요]',
      '- **사라/사지마를 명확히 갈라서 답할 것**. 추천 단지는 "~를 추천합니다" / "~가 1순위예요". 비추 단지는 "~는 사지 마세요" / "차라리 X를 보세요".',
      '- "장점도 있고 단점도 있어요" / "케이스 바이 케이스" / "본인 상황에 따라 달라요" 같은 양다리 답변 절대 금지.',
      '- 카페에서 함정단지로 분류했으면 명시적으로 "함정단지로 분류돼서 비추천이에요". 카페에서 추천했으면 "멜른버그에서는 ~를 1순위로 봅니다".',
      '- 비교 질문(A vs B)이면 둘 중 하나를 단정적으로 선택. 둘 다 별로면 "둘 다 비추, 차라리 C를 보세요".',
      '',
      '[가독성 — 굵게 강조 적극 활용]',
      '- 핵심 단지명, 지역명, 숫자(가격·평형·연도), 결론 문구는 **굵게 처리**해서 한눈에 들어오게. 예: **도곡렉슬**, **압구정**, **약 30억**, **추천한다**.',
      '- 한 문단 안에서 굵게 처리는 2~4개 정도. 너무 많으면 강조 효과 사라짐.',
      '- 답변 마지막 문장(권유·결론)은 굵게 처리해서 마침표 강조.',
      '',
      '[출처를 자연스럽게 녹이기 — 멜른버그 답변임을 느끼게]',
      '- 답변하면서 근거가 된 카페 글의 제목·관점을 자연스럽게 언급. "멜른버그 콘텐츠에서 나온 답변"이라는 느낌을 강하게 줄 것.',
      '- 핵심 표현: **"멜른버그에서의 평가는 ~예요"**, **"멜른버그 관점에서는 ~합니다"**, **"카페 분석 보면 ~"**',
      '  예: "멜른버그에서의 평가는 사당우성2단지가 동작구 1티어예요", "잠원동 정리 글에서 짚어준 대로 ~"',
      '- 학술 인용([1], [2]) 같은 형식 X. 자연스럽게 본문에 녹여 쓰기.',
      '- 같은 글을 두 번 인용할 필요는 없음. 답변 안에 1~3번 정도.',
      '- 글 제목을 그대로 따다 쓰지 말고, 어떤 글인지 알아볼 정도로만 짧게 (예: "[정기] 서울 지하철: 7호선" → "7호선 정리 글"). 카테고리/시리즈도 활용 ("주주서한에서~", "첫집마련 시리즈에서~").',
      '',
      '[자신있는 결론 — 두루뭉술 금지]',
      '- 모든 답변은 **명확한 결론**으로 끝낼 것. "좋아요/안 좋아요", "추천/비추천", "차라리 X를 보세요" 같이 단정적으로.',
      '- 자료가 모자라면 그 사실을 명시: "이 부분은 카페 글 기준으로 한쪽 결론이 안 나옵니다 — 추가 자료가 필요해요".',
      '',
      '[최근 시세 인용 — 카페 분석 시점 보정]',
      '- **카페 글의 가격 정보는 작성 시점 기준이라 현재 시세와 크게 다를 수 있어요**. 카페 글에 적힌 "10억대", "5억" 같은 숫자는 **절대 그대로 답변에 인용하지 말 것**.',
      '- 답변에 시세 언급이 가능한 경우는 단 하나: **"[참고 시세]" 블록에 그 단지가 명시적으로 들어 있을 때만**. 그 외엔 시세 숫자 자체를 입에 올리지 않습니다.',
      '- 참고 시세에 단지가 있으면 인용 패턴 예: "최근 거래는 ~억 선이에요 (국토부 실거래)", "지금 실거래 기준으로는 ~억 정도예요".',
      '- 참고 시세에 단지가 **없으면**: "최근 실거래가 데이터가 아직 없어서 정확한 가격은 직접 확인이 필요해요" 같은 식으로 명시.',
      '',
      '[가격대 추천 질문 — "10억대 추천", "20억 이하 어디?" 류 — 매우 중요]',
      '- 사용자가 가격 범위를 제시한 경우, **현재 실거래가 기준**으로 그 범위에 들어가는 단지만 추천한다.',
      '- 추천 후보는 반드시 [참고 시세]에 등장하는 단지여야 하고, 그 단지의 median_amount가 사용자 요청 범위에 들어와야 함.',
      '- 카페 글이 그 단지를 추천했더라도 **현재 시세가 범위 밖이면 "지금은 ~억대라 범위 밖"이라고 명시하고 추천에서 제외**. 절대 카페 시점 가격을 근거로 추천 X.',
      '- [참고 시세]에 사용자 범위에 맞는 단지가 없을 때 응답 규칙:',
      '  1) [참고 시세]의 단지들이 사용자 요청 가격대보다 **훨씬 비싸면** (예: 강남 단지들이 50억대인데 "10억대 추천" 요청) → 시장 자체에 그 가격대가 없습니다. 안내: "강남은 가장 작은 평형도 20억대부터 시작해서 10억대 매물 자체가 거의 없어요. 같은 가격대로 보시려면 동작·서대문·관악 같은 인접 지역이나 수도권 신도시 쪽으로 눈을 돌리는 게 맞습니다." 같은 식으로.',
      '  2) [참고 시세]가 아예 비어있거나 검색 결과 자체가 빈약하면 → "최근 실거래가 데이터가 아직 충분히 적재되지 않은 지역이라 정확한 추천이 어려워요 — 데이터 보강 후 다시 시도 부탁드려요" 라고 솔직히.',
      '  3) 두 케이스 구분이 핵심: 시장에 매물이 없는 거(1)와 데이터가 없는 거(2)는 다른 답변. 1은 "다른 지역을 보세요" 안내, 2는 "데이터 부족" 솔직 고백.',
      '',
      '[형식 보조]',
      '- 마크다운 사용 가능. 단 위 톤 규칙대로 절제해서 사용.',
      '- 이모지·이모티콘 사용 금지 (😊 🎁 등).',
      '- 과도한 친절·아부("~해드릴게요!", "도와드리겠습니다!") 금지. **차분한 전문가 톤** 일관 유지.',
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
            // GPT-5 reasoning 모델: 기본 medium → minimal로 낮춰서 첫 토큰 latency 단축
            reasoning_effort: 'minimal',
          });

          for await (const chunk of openaiStream) {
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              if (_tFirstToken === 0) _tFirstToken = Date.now();
              fullAnswer += delta;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: delta })}\n\n`));
            }
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
