import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
    client = new OpenAI({ apiKey });
  }
  return client;
}

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIM = 1536;

// 글을 의미 단위로 쪼개서 임베딩 청크 만듦
// 한국어 카페 글 기준으로 ~1000자 단위, 가능하면 단락 경계 살림
export function chunkText(content: string, maxChars = 1000): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  // 단락 단위로 분리 (빈 줄 기준)
  const paragraphs = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      // 단락 자체가 너무 김 — 줄·문장 단위로 추가 분리
      if (buffer) {
        chunks.push(buffer);
        buffer = '';
      }
      const sentences = para.split(/(?<=[.!?。！？\n])\s+/).filter(Boolean);
      let sb = '';
      for (const s of sentences) {
        if (sb.length + s.length + 1 > maxChars) {
          if (sb) chunks.push(sb);
          sb = s.length > maxChars ? s.slice(0, maxChars) : s;
        } else {
          sb = sb ? `${sb} ${s}` : s;
        }
      }
      if (sb) chunks.push(sb);
      continue;
    }
    if (buffer.length + para.length + 2 > maxChars) {
      chunks.push(buffer);
      buffer = para;
    } else {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const oa = getOpenAI();
  const res = await oa.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}
