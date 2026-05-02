// ──────────────────────────────────────────────
// 카페 글 메타데이터 자동 추출 스크립트
// ──────────────────────────────────────────────
// 동작:
//   - cafe_posts에서 metadata_extracted_at IS NULL인 글을 가져와
//   - Claude Haiku로 카테고리·지역·주제 등 추출
//   - cafe_posts에 메타데이터 저장
//   - 중간에 멈춰도 다시 실행하면 이어서 처리
//
// 실행 전 사전 작업:
//   1. SQL: supabase/012_cafe_posts_metadata.sql 적용
//   2. .env.local에 두 값 추가:
//        SUPABASE_SERVICE_ROLE_KEY=...   (Supabase Dashboard → Settings → API → service_role)
//        ANTHROPIC_API_KEY=...           (이미 있다면 skip)
//   3. node 18+ 필요
//
// 실행:
//   node scripts/enrich-cafe-metadata.mjs
//   node scripts/enrich-cafe-metadata.mjs --limit 100   (한 번에 100개만)
//   node scripts/enrich-cafe-metadata.mjs --concurrency 5  (병렬도, 기본 3)
//
// 비용 추정: Haiku 4.5 기준 약 $0.003/글 × 3,786 ≈ $11
// 시간: 병렬 3 기준 약 30~60분
// ──────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// .env.local 직접 파싱 (dotenv 없이)
const envPath = path.join(ROOT, '.env.local');
try {
  const envText = readFileSync(envPath, 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
} catch {
  console.warn('⚠ .env.local 못 읽음 — 환경변수가 이미 설정돼있어야 함');
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음');
  console.error('   .env.local에 SUPABASE_SERVICE_ROLE_KEY 추가 필요');
  console.error('   (Supabase Dashboard → Settings → API → service_role secret)');
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error('❌ ANTHROPIC_API_KEY 없음');
  process.exit(1);
}

// 인자 파싱
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const LIMIT = parseInt(getArg('limit', '99999'), 10);
const CONCURRENCY = parseInt(getArg('concurrency', '3'), 10);
const MODEL = getArg('model', 'claude-haiku-4-5-20251001');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ─── 추출 프롬프트
const EXTRACTION_SYSTEM_PROMPT = `당신은 부동산 카페 글의 메타데이터를 추출하는 분류기다.
주어진 글의 제목과 본문을 보고 아래 JSON 스키마로 응답하라. JSON만 출력하고 다른 설명은 일절 하지 마라.

스키마:
{
  "category": "공지" | "콘텐츠" | "운영" | "링크모음",
  "content_type": "주주서한" | "첫집마련" | "정비사업" | "지역분석" | "케이스스터디" | "시장분석" | "정기시황" | "청약분양" | "기타" | null,
  "series_name": string | null,
  "series_number": number | null,
  "regions": string[],
  "topics": string[],
  "is_meaningful": boolean
}

규칙:
- category: 글의 1차 분류
  · "공지": 카페 운영 공지·이벤트
  · "콘텐츠": 분석/지식 글 (대부분 여기 해당)
  · "운영": 등업·인사·잡담
  · "링크모음": URL/외부 자료 모음
- content_type: 콘텐츠일 때 세부 유형. 해당 없으면 null
- series_name + series_number: 시리즈 글이면 채움 (예: "첫집마련(60)" → series_name="첫집마련", series_number=60). 아니면 둘 다 null
- regions: 글에 언급된 지역명 (시·구·동 단위, 중복 제거). 예: ["잠원동", "서초구", "강남"]. 없으면 빈 배열
- topics: 글의 주요 주제 키워드 3~7개 (예: ["재건축", "토허제", "시드머니"]). 일반 명사 우선, 너무 세부적인 것은 제외
- is_meaningful: false면 검색에서 제외됨. 등업글·인사·짧은 잡담·중복 공지는 false. 기본 true.

본문이 짧거나 정보가 부족해도 추측하지 말고 자료가 명시한 것만 채울 것.`;

async function extractMetadata(post) {
  const text = `제목: ${post.title}\n\n본문:\n${(post.content || '').slice(0, 4000)}`;
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
  });
  const raw = res.content.find((c) => c.type === 'text')?.text ?? '';
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

async function processPost(post) {
  try {
    const meta = await extractMetadata(post);
    const { error } = await supabase
      .from('cafe_posts')
      .update({
        category: meta.category ?? null,
        content_type: meta.content_type ?? null,
        series_name: meta.series_name ?? null,
        series_number: meta.series_number ?? null,
        regions: Array.isArray(meta.regions) ? meta.regions : [],
        topics: Array.isArray(meta.topics) ? meta.topics : [],
        is_meaningful: meta.is_meaningful !== false,  // 기본 true
        metadata_extracted_at: new Date().toISOString(),
      })
      .eq('id', post.id);
    if (error) throw error;
    return { ok: true, post, meta };
  } catch (e) {
    return { ok: false, post, error: e.message ?? String(e) };
  }
}

async function main() {
  console.log(`🚀 메타데이터 추출 시작 (model=${MODEL}, concurrency=${CONCURRENCY}, limit=${LIMIT})`);

  // 미처리 글 조회 — Supabase 1000건 제한 우회: range로 페이지네이션
  const PAGE = 1000;
  const posts = [];
  for (let from = 0; from < LIMIT; from += PAGE) {
    const to = Math.min(from + PAGE - 1, LIMIT - 1);
    const { data: pageData, error: fetchErr } = await supabase
      .from('cafe_posts')
      .select('id, title, content')
      .is('metadata_extracted_at', null)
      .order('id', { ascending: true })
      .range(from, to);
    if (fetchErr) {
      console.error('❌ posts fetch 실패:', fetchErr.message);
      process.exit(1);
    }
    if (!pageData || pageData.length === 0) break;
    posts.push(...pageData);
    if (pageData.length < PAGE) break;  // 마지막 페이지
  }
  console.log(`📋 처리 대상: ${posts.length}건`);
  if (posts.length === 0) {
    console.log('✅ 처리할 글 없음 (모두 enriched)');
    return;
  }

  let done = 0;
  let ok = 0;
  let failed = 0;
  const startTime = Date.now();

  // 워커 풀 패턴 — CONCURRENCY만큼 동시 실행
  const queue = [...posts];
  async function worker() {
    while (queue.length > 0) {
      const post = queue.shift();
      if (!post) break;
      const result = await processPost(post);
      done++;
      if (result.ok) {
        ok++;
        if (done % 20 === 0 || done === posts.length) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const eta = posts.length > done ? Math.round((Date.now() - startTime) / done * (posts.length - done) / 1000) : 0;
          console.log(`   [${done}/${posts.length}] OK=${ok} FAIL=${failed} | ${elapsed}s 경과, ETA ${eta}s`);
        }
      } else {
        failed++;
        console.warn(`   ✗ #${result.post.id} "${result.post.title?.slice(0, 30)}": ${result.error}`);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n🎉 완료 — 성공 ${ok} / 실패 ${failed} / 전체 ${done} (${elapsed}s)`);
  if (failed > 0) {
    console.log('   실패한 글은 다시 실행하면 자동 재시도됨 (metadata_extracted_at IS NULL 기준)');
  }
}

main().catch((e) => {
  console.error('❌ 치명적 오류:', e);
  process.exit(1);
});
