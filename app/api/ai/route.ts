import { NextRequest, NextResponse } from 'next/server';
// import Anthropic from '@anthropic-ai/sdk'; // ← Claude → GPT-5-mini로 교체 (2026-05)
import { createClient } from '@/lib/supabase/server';
import { embedTexts, getOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

    const [queryEmbedding] = await embedTexts([question.trim()]);
    const keywords = extractKeywords(question.trim());

    let chunks: ChunkRow[] | null = null;
    let searchError: { message?: string } | null = null;

    // 1차: 하이브리드 검색 (008 마이그레이션 적용 시)
    {
      const res = await supabase.rpc('search_cafe_chunks_hybrid', {
        query_embedding: queryEmbedding as unknown as string,
        keywords,
        match_count: 10,
      });
      chunks = (res.data as ChunkRow[] | null) ?? null;
      searchError = res.error;
    }

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

    const rows = (chunks ?? []) as ChunkRow[];

    // ─── 시세 보조 컨텍스트 (국토부 실거래가) ───────────────
    // 검색된 카페 글에서 언급되는 단지명을 추출 → apt_representative_price view 조회 → 컨텍스트 첨부
    let priceContext = '';
    try {
      const { data: aptList } = await supabase
        .from('apt_trades')
        .select('apt_nm')
        .limit(10000);

      const allAptNames = Array.from(new Set((aptList ?? []).map((r) => r.apt_nm as string)))
        .filter((n) => n && n.length >= 4); // 4자 미만은 false positive 위험 (예: '신동')

      const corpus = rows.map((r) => `${r.post_title} ${r.chunk_content}`).join(' ');
      const matched = new Set<string>();
      for (const apt of allAptNames) {
        if (corpus.includes(apt)) matched.add(apt);
      }

      if (matched.size > 0) {
        const { data: prices } = await supabase
          .from('apt_representative_price')
          .select('apt_nm, umd_nm, area_group, trade_count, median_amount, last_deal_date')
          .in('apt_nm', Array.from(matched).slice(0, 30))
          .order('apt_nm')
          .order('area_group');

        if (prices && prices.length > 0) {
          const lines = (prices as Array<{ apt_nm: string; umd_nm: string; area_group: number; trade_count: number; median_amount: number; last_deal_date: string }>).map((p) => {
            const eok = (p.median_amount / 10000).toFixed(1);
            return `- ${p.apt_nm} (${p.umd_nm}) ${p.area_group}㎡대: 약 ${eok}억 (최근 6개월 ${p.trade_count}건 중앙값, 마지막 거래 ${p.last_deal_date})`;
          });
          priceContext = `\n\n[참고 시세 — 국토부 실거래가 기반]\n정책: 최근 6개월·직거래 제외·해제거래 제외·1층 제외·거래 3건 이상 단지만 산출.\n${lines.join('\n')}`;
        }
      }
    } catch (e) {
      console.warn('price context build failed:', e instanceof Error ? e.message : e);
    }

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
      '당신은 멜른버그 콘텐츠 전문가임.',
      '',
      '답변 원칙:',
      '1. 제공된 참고 자료를 기반으로 답변하되, 직접적인 단어 일치가 아니어도 주제적·맥락적으로 관련 있으면 활용해서 답변할 것.',
      '2. 참고 자료의 내용을 종합·해석·연결해서 답변해도 됨. 단, 자료에 없는 새로운 사실(가격, 규제, 데이터)은 만들어내지 말 것.',
      '3. 자료에서 직접 답이 안 나오면 "정확한 답은 없지만, 관련해서 이런 관점이 있음"이라고 부분 답변을 시도할 것.',
      '4. "관련 내용이 없습니다"는 진짜 자료가 전혀 무관할 때만 사용.',
      '',
      '[답변 톤 — 매우 중요]',
      '- **다정한 반말**. 친한 친구·선배가 차분히 설명해주는 느낌.',
      '  예: "~야", "~거든", "~지", "~잖아", "~구나", "~봐", "~네"',
      '  예: "이쪽이 더 나아 보여", "이유는 GTX 호재가 큰 거거든", "상황 보면 ~한 흐름이 나오지"',
      '- 존댓말("~입니다", "~예요", "~해요") X. 음슴체("~임", "~함") X. **반말 + 다정한 어미**가 기본.',
      '- 단문으로 뚝뚝 끊지 말고 **자연스러운 문단으로 풀어서 서술**. 한 문장에 인과·맥락·이유를 같이 담을 것.',
      '- 번호 리스트(1. 2. 3.)나 불릿(-)은 진짜 병렬 항목 비교일 때만 최소한으로. 기본은 문단 서술.',
      '- 번호 리스트를 쓸 때 규칙: 반드시 `1.`, `2.`, `3.` 순서대로 명시적으로 매길 것 (모든 항목을 `1.`로 쓰면 안 됨). 항목 사이에 빈 줄이나 소제목 끼워넣지 말고 연속으로 작성 — 안 그러면 번호가 1, 1, 1로 끊겨 보임.',
      '- 소제목(## 제목)은 답변이 정말 길어 섹션 구분이 필요할 때만.',
      '- 굵게(**...**)는 핵심 단지명·지역명·숫자 같은 키워드만 강조.',
      '',
      '[출처를 자연스럽게 녹이기 — 멜른버그 답변임을 느끼게]',
      '- 답변하면서 근거가 된 카페 글의 제목·관점을 자연스럽게 언급. "멜른버그 콘텐츠에서 나온 답변"이라는 느낌을 강하게 줄 것.',
      '- 핵심 표현: **"멜른버그에서의 평가는 ~"**, **"멜른버그 관점에서는 ~"**, **"카페 분석 보면 ~"**',
      '  예: "멜른버그에서의 평가는 사당우성2단지가 동작구 1티어임", "잠원동 정리 글에서 짚어준 대로 ~"',
      '- 학술 인용([1], [2]) 같은 형식 X. 자연스럽게 본문에 녹여 쓰기.',
      '- 같은 글을 두 번 인용할 필요는 없음. 답변 안에 1~3번 정도.',
      '- 글 제목을 그대로 따다 쓰지 말고, 어떤 글인지 알아볼 정도로만 짧게 (예: "[정기] 서울 지하철: 7호선" → "7호선 정리 글"). 카테고리/시리즈도 활용 ("주주서한에서~", "첫집마련 시리즈에서~").',
      '',
      '[자신있는 결론 — 두루뭉술 금지]',
      '- 모든 답변은 **명확한 결론**으로 끝낼 것. "좋다/안 좋다", "추천/비추천", "차라리 X를 봐라" 같이 단정적으로.',
      '- "장점도 있고 단점도 있음", "케이스 바이 케이스", "본인 상황에 따라 다름" 같은 양다리 답변 금지.',
      '- 자료에 충분한 근거가 있으면 카페가 어느 쪽 손을 들어줬는지 명확히 전달. 예: "멜른버그에서는 X보다 Y를 더 추천했어", "이건 함정단지로 분류돼있어 비추".',
      '- 비교 질문이면 둘 중 하나를 명확히 선택. 둘 다 별로면 "차라리 Z를 봐라" 식으로 대안 제시.',
      '- 진짜 결론을 못 내릴 정도로 자료가 모자라면 그 사실을 명시: "이 부분은 카페 글 기준으로 한쪽 결론이 안 나와 — 추가 자료 필요".',
      '',
      '[최근 시세 인용 — 카페 분석 시점 보정]',
      '- 답변 컨텍스트에 "[참고 시세]" 블록이 첨부된 경우, **카페 분석은 작성 시점 기준이라 시세가 옛날일 수 있음**을 짚고 최근 시세를 자연스럽게 언급할 것.',
      '- 인용 패턴 예: "카페 분석 시점엔 ~억대로 봤는데, 최근 거래는 ~억까지 올라왔어", "지금 실거래 기준으로는 ~억 선이야".',
      '- **참고 시세 블록에 없는 단지의 시세는 절대 언급하지 말 것 (지어내지 말 것).**',
      '- 참고 시세 블록 자체가 없으면 시세 얘기 자체를 하지 않음.',
      '- 출처 표기: "국토부 실거래가 기준"이라고 한 번 정도 짚어주면 신뢰도 ↑',
      '',
      '[형식 보조]',
      '- 마크다운 사용 가능. 단 위 톤 규칙대로 절제해서 사용.',
      '- 이모지·이모티콘 사용 금지 (😊 🎁 등).',
      '- 과도한 친절·아부("~해주세요!", "~드릴게요!") 금지. 차분한 다정 반말 일관 유지.',
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
          });

          for await (const chunk of openaiStream) {
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              fullAnswer += delta;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: delta })}\n\n`));
            }
          }
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
