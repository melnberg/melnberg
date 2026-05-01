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

    const systemPrompt = context
      ? `당신은 멜른버그 카페의 AI 어시스턴트입니다. 아래 카페 글 발췌를 근거로 사용자 질문에 답해주세요.\n발췌에 없는 내용은 추측하지 말고 모른다고 답하세요.\n\n참고 자료:\n${context}`
      : '당신은 멜른버그 카페의 AI 어시스턴트입니다. 관련 카페 글을 찾지 못했습니다. 일반 지식으로 답하되, 멜른버그 고유 정보는 모른다고 답하세요.';

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
