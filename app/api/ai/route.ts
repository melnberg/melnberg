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
      '- 음슴체 ("~임", "~함", "~봄"). 존댓말 X.',
      '- 그러나 단문으로 뚝뚝 끊지 말고, **자연스러운 문단으로 풀어서 서술**할 것.',
      '- "~인 이유는 A 때문임. 게다가 B도 작용하고 있어서 C 같은 효과가 나옴." 처럼 한 호흡으로 길게 이어가기.',
      '- 단순 사실 나열·짧은 단문 반복 금지. 한 문장 안에서 인과·맥락·이유를 같이 풀어낼 것.',
      '- 번호 리스트(1. 2. 3.)나 불릿(-)은 진짜 병렬 항목 비교일 때만 최소한으로. 기본은 문단 서술.',
      '- 소제목(## 제목)은 답변이 정말 길어 섹션 구분이 필요할 때만. 짧은 답변엔 불필요.',
      '- 굵게(**...**)는 핵심 단지명·지역명·숫자 같은 키워드만 강조.',
      '',
      '[형식 보조]',
      '- 마크다운 사용 가능. 단 위 톤 규칙대로 절제해서 사용.',
      '- 이모지·이모티콘 사용 금지.',
      '- 친절 어투("~해주세요!", "~드립니다!") 금지. 음슴체 + 서술형 일관 유지.',
    ].join('\n');

    const systemPrompt = context
      ? `${corePrompt}\n\n참고 자료:\n${context}`
      : `${corePrompt}\n\n참고 자료: (검색 결과 없음)\n→ "멜른버그 DB에 관련 내용이 없어요." 한 줄로 답할 것.`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`));
        let fullAnswer = '';
        try {
          const anthropicStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: question.trim() }],
          });

          for await (const event of anthropicStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullAnswer += event.delta.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        } catch (err) {
          console.error('Claude stream error:', err);
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
