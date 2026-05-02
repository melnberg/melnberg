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
      match_count: 5,
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
      '답변 작성 규칙:',
      '- 음슴체로 답변. 예: "정리함.", "발송드림.", "~임.", "~함."',
      '- 짧고 밀도 높은 문장. 불필요한 수식어·과장 표현·인사말·맺음말 금지.',
      '- 이모지·이모티콘 사용 금지 (😊 🎁 ⚠️ ❌ ✅ 등 일체 사용 안 함).',
      '- 마크다운 헤더(#, ##, ###) 사용 금지. 강조는 **굵게**만 절제해 사용.',
      '- 구분선(---) 남발 금지. 항목 분리는 짧은 줄바꿈으로 충분.',
      '- 진중한 톤. 친절·다정 어투("~해주세요!", "~드립니다!" 등) 자제.',
    ].join('\n');

    const systemPrompt = context
      ? `당신은 멜른버그 카페의 AI 어시스턴트임. 아래 카페 글 발췌를 근거로 답할 것.\n발췌에 없는 내용은 추측하지 말고 "자료 없음"으로 답할 것.\n\n${styleRules}\n\n참고 자료:\n${context}`
      : `당신은 멜른버그 카페의 AI 어시스턴트임. 관련 카페 글을 찾지 못함. 멜른버그 고유 정보는 "자료 없음"으로 답하고, 일반 지식만 간결히 제공할 것.\n\n${styleRules}`;

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
