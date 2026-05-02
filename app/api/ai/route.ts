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

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: '질문을 입력해주세요.' }, { status: 400 });
    }

    const supabase = await createClient();

    const [queryEmbedding] = await embedTexts([question.trim()]);

    const { data: chunks, error: searchError } = await supabase.rpc('search_cafe_chunks', {
      query_embedding: queryEmbedding as unknown as string,
      match_count: 10,
    });

    if (searchError) {
      console.error('Vector search error:', searchError);
      return NextResponse.json({ error: '검색 중 오류가 발생했습니다.' }, { status: 500 });
    }

    const rows = (chunks ?? []) as ChunkRow[];

    // 출처 — 글 단위로 dedup
    const sourceMap = new Map<number, { id: number; title: string; url: string | null }>();
    for (const c of rows) {
      if (!sourceMap.has(c.post_id)) {
        sourceMap.set(c.post_id, { id: c.post_id, title: c.post_title, url: c.external_url });
      }
    }
    const sources = Array.from(sourceMap.values());

    const context = rows.length > 0
      ? rows.map((c, i) => `[${i + 1}] ${c.post_title}\n${c.chunk_content}`).join('\n\n---\n\n')
      : '';

    const styleRules = [
      '답변 작성 규칙 (반드시 준수):',
      '- 음슴체. 예: "정리함.", "~임.", "~함.", "추천."',
      '- 짧고 밀도 높은 문장. 인사말·맺음말·서론·접속어 금지.',
      '- 마크다운 일체 금지: # ## ### 헤더, ** 굵게, * 이탤릭, ` 코드, --- 구분선, | 표, > 인용 모두 사용 금지.',
      '- 이모지·이모티콘 일체 금지 (😊 🎁 ⚠️ ❌ ✅ 등 어떤 것도).',
      '- 항목 나열 필요시 "- " 대시만 사용. 번호(1. 2. 3.)도 가급적 피하고 줄바꿈으로 분리.',
      '- 친절·다정 어투("~해주세요!", "~드립니다!", "~ㅎ", "~?", "~ㅠ" 등) 금지.',
      '- 평문 텍스트로만 답변. AI스러운 꾸밈 일체 배제.',
      '- 자신있는 말투. 모호한 표현·헤징 금지.',
      '- 절대 금지 표현: "자료가 부족합니다", "답변드리기 어렵습니다", "확인이 어렵습니다", "자료에 없습니다", "더 자세한 정보는...", "정보가 제한적입니다", "추가 정보가 필요합니다" 등 자료 없음을 알리는 모든 사과·안내 문구.',
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
            max_tokens: 1024,
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
