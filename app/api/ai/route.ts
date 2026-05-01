import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/openai'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json()

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json({ error: '질문을 입력해주세요.' }, { status: 400 })
    }

    const supabase = createClient()

    const queryEmbedding = await embedText(question.trim())

    const { data: chunks, error: searchError } = await supabase.rpc('search_cafe_chunks', {
      query_embedding: queryEmbedding,
      match_count: 5,
      match_threshold: 0.7,
    })

    if (searchError) {
      console.error('Vector search error:', searchError)
      return NextResponse.json({ error: '검색 중 오류가 발생했습니다.' }, { status: 500 })
    }

    const sourceMap = new Map()
    if (chunks && chunks.length > 0) {
      for (const chunk of chunks) {
        if (!sourceMap.has(chunk.post_id)) {
          sourceMap.set(chunk.post_id, {
            id: chunk.post_id,
            title: chunk.post_title,
            url: chunk.post_url,
          })
        }
      }
    }
    const sources = Array.from(sourceMap.values())

    const context =
      chunks && chunks.length > 0
        ? chunks
            .map((c, i) => '[' + (i + 1) + '] ' + c.post_title + '
' + c.content)
            .join('

---

')
        : ''

    const systemPrompt = context
      ? '당신은 멜른버그 커뮤니티의 AI 어시스턴트입니다. 아래 카페 글 내용을 참고하여 사용자의 질문에 친절하고 정확하게 답변해주세요. 참고 자료에 없는 내용은 솔직하게 모른다고 말해주세요.

참고 자료:
' + context
      : '당신은 멜른버그 커뮤니티의 AI 어시스턴트입니다. 현재 관련 자료를 찾지 못했습니다. 일반적인 지식으로 친절하게 답변해주세요.'

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const sourcesData = 'data: ' + JSON.stringify({ type: 'sources', sources }) + '

'
        controller.enqueue(encoder.encode(sourcesData))

        try {
          const anthropicStream = await anthropic.messages.stream({
            model: 'claude-sonnet-4-5',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: question.trim() }],
          })

          for await (const event of anthropicStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const chunk = 'data: ' + JSON.stringify({ type: 'text', text: event.delta.text }) + '

'
              controller.enqueue(encoder.encode(chunk))
            }
          }

          controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'done' }) + '

'))
        } catch (err) {
          console.error('Claude stream error:', err)
          controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'error', message: 'AI 응답 생성 중 오류가 발생했습니다.' }) + '

'))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    console.error('AI route error:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
