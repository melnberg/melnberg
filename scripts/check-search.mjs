// 임시 진단: RPC 직접 호출
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const embed = await openai.embeddings.create({ model: 'text-embedding-3-small', input: '도곡렉슬 어때' });
const queryEmbedding = embed.data[0].embedding;

console.log('=== hybrid RPC, keywords=["도곡렉슬"] ===');
const r1 = await supabase.rpc('search_cafe_chunks_hybrid', {
  query_embedding: queryEmbedding,
  keywords: ['도곡렉슬'],
  match_count: 5,
});
console.log('error:', r1.error);
console.log('rows:', r1.data?.length, '건');
if (r1.data) for (const c of r1.data) console.log(' -', c.post_title?.slice(0, 60), 'sim:', c.similarity?.toFixed(3));

console.log('\n=== hybrid RPC, keywords=[] (vector only) ===');
const r2 = await supabase.rpc('search_cafe_chunks_hybrid', {
  query_embedding: queryEmbedding,
  keywords: [],
  match_count: 5,
});
console.log('error:', r2.error);
console.log('rows:', r2.data?.length, '건');
if (r2.data) for (const c of r2.data) console.log(' -', c.post_title?.slice(0, 60), 'sim:', c.similarity?.toFixed(3));

console.log('\n=== 카페 글 직접 select (도곡렉슬) ===');
const r3 = await supabase.from('cafe_posts').select('id, title').ilike('title', '%도곡렉슬%').limit(5);
console.log('error:', r3.error);
console.log('rows:', r3.data?.length);
if (r3.data) for (const p of r3.data) console.log(' -', p.title?.slice(0, 60));
