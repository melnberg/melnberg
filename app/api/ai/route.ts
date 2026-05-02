import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { embedTexts } from '@/lib/openai';

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
    let limitResult: { blocked?: boolean; used_today?: number; daily_limit?: number } | undefined;

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
        { error: `${limitLabel} 한도(${dailyLimit}회) 도달함. 내일 다시 시도해주세요.` },
        { status: 429 },
      );
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

    const context = rows.length > 0
      ? rows.map((c, i) => `[${i + 1}] ${c.post_title}\n${c.chunk_content}`).join('\n\n---\n\n')
      : '';

    const styleRules = [
      '답변 작성 규칙 (반드시 준수):',
      '',
      '[톤]',
      '- 음슴체. 예: "정리함.", "~임.", "~함.", "추천."',
      '- 짧고 밀도 높은 문장. 인사말·맺음말·서론·접속어 금지.',
      '- 친절·다정 어투("~해주세요!", "~드립니다!", "~ㅎ", "~?", "~ㅠ" 등) 금지.',
      '- 이모지·이모티콘 일체 금지 (😊 🎁 ⚠️ ❌ ✅ 등 어떤 것도).',
      '- 자신있는 말투. 모호한 표현·헤징 금지.',
      '',
      '[답변 깊이 — 가장 중요]',
      '- 단순 사실 나열 금지. 각 포인트마다 자료에 있는 배경·이유·맥락을 함께 서술.',
      '- "왜 그런지", "어떤 맥락에서 그런지" 자료에서 근거를 찾아 설명할 것.',
      '- 발췌가 충분하면 분량 짧게 끊지 말고 자료에서 확인되는 만큼 깊이 있게 작성.',
      '- 데이터·수치 인용 시 그 수치가 의미하는 바를 같이 해석.',
      '',
      '[구조와 형식 — 마크다운 사용]',
      '- 답변은 마크다운으로 작성. 렌더러가 굵게·번호·목록·코드를 시각적으로 표현함.',
      '- 섹션 구분이 필요하면 ## 소제목.',
      '- 더 작은 그룹은 ### 사용.',
      '- 순서가 중요한 단계는 1. 2. 3. (numbered list). 각 항목 시작은 **굵은 핵심어** 로.',
      '  예: "1. **입지 경쟁력** — 강남 접근성과 한강 인접이 가격 방어 핵심."',
      '- 순서 무관한 항목은 - 대시 (bulleted list).',
      '- 핵심 키워드 강조는 **굵게**.',
      '',
      '[자료 사용 원칙]',
      '- 발췌에 명시된 사실만 사용. 일반 상식·추측·외부 지식 추가 금지.',
      '- 발췌 여러 개를 종합해 맥락 있는 답변 구성. 각 발췌를 따로따로 인용하지 말고 통합 서술.',
      '- 질문과 무관한 발췌는 무시. 관련 있는 것만 활용.',
      '',
      '[자료 없음 처리 — 사과·헤징 절대 금지]',
      '- 다음 표현 일체 사용 금지: "자료가 부족합니다", "답변드리기 어렵습니다", "확인이 어렵습니다", "자료에 없습니다", "더 자세한 정보는...", "정보가 제한적입니다", "추가 정보가 필요합니다".',
      '- 자료에서 확인되는 부분까지만 단정적으로 서술하고 거기서 끝낼 것. 부족함을 굳이 언급하지 말 것.',
      '- 자료가 정말 0건이면 한 줄로만: "관련 내용 없음."',
    ].join('\n');

    const systemPrompt = context
      ? `당신은 멜른버그 카페의 AI 어시스턴트임. 아래 카페 글 발췌를 근거로 답할 것.\n발췌에 명시적으로 있는 사실만 단정적으로 서술. 추측·확장 금지.\n\n${styleRules}\n\n참고 자료:\n${context}`
      : `당신은 멜른버그 카페의 AI 어시스턴트임. 관련 카페 글이 검색되지 않음.\n\n${styleRules}\n\n답변: "관련 내용 없음."`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`));
        try {
          const anthropicStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: question.trim() }],
          });

          for await (const event of anthropicStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        } catch (err) {
          console.error('Claude stream error:', err);
          const message = err instanceof Error ? err.message : 'AI 응답 생성 중 오류가 발생했습니다.';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`));
        } finally {
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
