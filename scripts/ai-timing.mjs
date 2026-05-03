// AI 답변 파이프라인 단계별 타이밍 측정
// 사용: node scripts/ai-timing.mjs "질문 텍스트"

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

function loadEnv() {
  const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const question = process.argv[2] || '도곡렉슬 어때';
console.log(`\n[질문] ${question}\n`);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const t0 = Date.now();

// 1. 임베딩
const embedRes = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: question,
});
const queryEmbedding = embedRes.data[0].embedding;
const tEmbed = Date.now();
console.log(`1. 임베딩          ${tEmbed - t0}ms`);

// 2. 키워드 추출 (간단 버전)
const keywords = question.replace(/[?!.,]/g, ' ').split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);

// 3. 하이브리드 검색
const searchRes = await supabase.rpc('search_cafe_chunks_hybrid', {
  query_embedding: queryEmbedding,
  keywords,
  match_count: 10,
});
const tSearch = Date.now();
const rows = searchRes.data ?? [];
console.log(`2. 카페 검색       ${tSearch - tEmbed}ms (청크 ${rows.length}개)`);

// 4. 시세 컨텍스트 (apt_representative_price)
const priceRes = await supabase
  .from('apt_representative_price')
  .select('apt_nm, umd_nm, area_group, trade_count, median_amount, last_deal_date');
const tPrice = Date.now();
console.log(`3. 시세 view 조회  ${tPrice - tSearch}ms (단지 ${priceRes.data?.length ?? 0}개)`);

// 5. 단지 매칭
const corpus = rows.map((r) => `${r.post_title} ${r.chunk_content}`).join(' ');
const matched = (priceRes.data ?? []).filter((p) => p.apt_nm && p.apt_nm.length >= 4 && corpus.includes(p.apt_nm));
const tMatch = Date.now();
console.log(`4. 단지명 매칭     ${tMatch - tPrice}ms (매칭 ${matched.length}개)`);

// 6. OpenAI 답변 스트리밍 (reasoning_effort: minimal)
const stream = await openai.chat.completions.create({
  model: 'gpt-5-mini',
  messages: [
    { role: 'system', content: '간단히 답해.' },
    { role: 'user', content: question },
  ],
  stream: true,
  max_completion_tokens: 1024,
  reasoning_effort: 'minimal',
});
const tOpenAIStart = Date.now();
console.log(`5. OpenAI 연결     ${tOpenAIStart - tMatch}ms`);

let firstToken = 0;
let charCount = 0;
for await (const chunk of stream) {
  const delta = chunk.choices?.[0]?.delta?.content ?? '';
  if (delta) {
    if (firstToken === 0) firstToken = Date.now();
    charCount += delta.length;
  }
}
const tDone = Date.now();
console.log(`6. 첫 토큰 도착    ${firstToken - tOpenAIStart}ms`);
console.log(`7. 답변 완료       ${tDone - firstToken}ms (${charCount}자)`);

console.log(`\n총 시간: ${tDone - t0}ms`);
