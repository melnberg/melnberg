// 기존 Storage 이미지(post-images / avatars) → WEBP 일괄 변환 + DB URL 치환.
// 용량관리 목적. webp 가 jpg/png 대비 30~70% 작음.
//
// 필요:
//   - sharp 설치: npm install --no-save sharp
//   - .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// 사용법:
//   node scripts/convert-storage-to-webp.mjs              # dry-run (변환 후보만 출력)
//   node scripts/convert-storage-to-webp.mjs --apply      # 실제 변환 + DB 치환
//   node scripts/convert-storage-to-webp.mjs --apply --delete-old   # + 원본 삭제

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락 — .env.local 확인');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const APPLY = process.argv.includes('--apply');
const DELETE_OLD = process.argv.includes('--delete-old');

console.log(`[mode] ${APPLY ? 'APPLY' : 'DRY-RUN'}${DELETE_OLD ? ' + DELETE-OLD' : ''}`);

// post-images 는 {user_id}/{filename} 구조 → 폴더 단위로 list
async function listAllRecursive(bucket, prefix = '') {
  const out = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) { console.error(`[list] ${bucket}/${prefix} ${error.message}`); break; }
    if (!data || data.length === 0) break;
    for (const it of data) {
      // 폴더 (id 가 null) 면 재귀
      if (it.id == null) {
        const sub = await listAllRecursive(bucket, prefix ? `${prefix}/${it.name}` : it.name);
        out.push(...sub);
      } else {
        out.push({ path: prefix ? `${prefix}/${it.name}` : it.name, size: it.metadata?.size ?? 0, mime: it.metadata?.mimetype ?? '' });
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

function isConvertible(name, mime) {
  if (/\.webp$/i.test(name)) return false;
  if (/\.gif$/i.test(name)) return false; // 애니메이션 손실 우려
  if (mime === 'image/webp' || mime === 'image/gif') return false;
  return /\.(jpe?g|png)$/i.test(name) || mime === 'image/jpeg' || mime === 'image/png';
}

async function convertOne(bucket, srcPath) {
  // 1) download
  const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(srcPath);
  if (dlErr || !blob) { console.error(`  ✗ download: ${dlErr?.message}`); return null; }
  const buf = Buffer.from(await blob.arrayBuffer());

  // 2) convert (sharp). 가로 max 1920px, quality 82.
  let webpBuf;
  try {
    webpBuf = await sharp(buf)
      .rotate() // EXIF 방향 보정
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.error(`  ✗ sharp: ${e.message}`);
    return null;
  }

  const newPath = srcPath.replace(/\.(jpe?g|png)$/i, '.webp');
  const ratio = ((1 - webpBuf.length / buf.length) * 100).toFixed(1);
  console.log(`  ${srcPath}  ${buf.length} → ${webpBuf.length} bytes (-${ratio}%)`);

  if (!APPLY) return { srcPath, newPath };

  // 3) upload
  const { error: upErr } = await sb.storage.from(bucket).upload(newPath, webpBuf, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (upErr) { console.error(`  ✗ upload: ${upErr.message}`); return null; }

  return { srcPath, newPath };
}

function publicUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// 본문에 URL 박혀있는 테이블들 — content/body 컬럼 치환
const TEXT_TABLES = [
  { table: 'posts', col: 'content' },
  { table: 'comments', col: 'content' },
  { table: 'apt_discussions', col: 'content' },
  { table: 'apt_discussion_comments', col: 'content' },
  { table: 'emart_comments', col: 'content' },
  { table: 'factory_comments', col: 'content' },
  { table: 'site_announcements', col: 'body' },
];

async function replaceUrlsInTextTables(oldUrl, newUrl) {
  let total = 0;
  for (const { table, col } of TEXT_TABLES) {
    // 페이지네이션
    let from = 0; const PAGE = 1000;
    while (true) {
      const { data, error } = await sb.from(table).select(`id, ${col}`).ilike(col, `%${oldUrl}%`).range(from, from + PAGE - 1);
      if (error) { console.error(`  ✗ select ${table}: ${error.message}`); break; }
      if (!data || data.length === 0) break;
      for (const row of data) {
        const updated = (row[col] ?? '').split(oldUrl).join(newUrl);
        if (updated === row[col]) continue;
        if (APPLY) {
          const { error: upErr } = await sb.from(table).update({ [col]: updated }).eq('id', row.id);
          if (upErr) { console.error(`  ✗ update ${table}#${row.id}: ${upErr.message}`); continue; }
        }
        total++;
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  return total;
}

async function replaceAvatarUrl(oldUrl, newUrl) {
  // profiles.avatar_url — exact prefix 매칭 (?v= 캐시버스터 포함 가능)
  const { data, error } = await sb.from('profiles').select('id, avatar_url').ilike('avatar_url', `${oldUrl}%`);
  if (error) { console.error(`  ✗ select profiles: ${error.message}`); return 0; }
  let n = 0;
  for (const row of (data ?? [])) {
    const next = newUrl + (row.avatar_url.includes('?') ? row.avatar_url.slice(row.avatar_url.indexOf('?')) : '');
    if (APPLY) {
      const { error: upErr } = await sb.from('profiles').update({ avatar_url: next }).eq('id', row.id);
      if (upErr) { console.error(`  ✗ update profiles#${row.id}: ${upErr.message}`); continue; }
    }
    n++;
  }
  return n;
}

async function processBucket(bucket, isAvatar) {
  console.log(`\n=== ${bucket} ===`);
  const files = await listAllRecursive(bucket);
  const targets = files.filter((f) => isConvertible(f.path, f.mime));
  console.log(`전체 ${files.length}개 / 변환대상 ${targets.length}개`);

  let savedBytes = 0;
  let dbUpdates = 0;
  let deleted = 0;

  for (const f of targets) {
    const r = await convertOne(bucket, f.path);
    if (!r) continue;
    savedBytes += f.size;

    const oldUrl = publicUrl(bucket, r.srcPath);
    const newUrl = publicUrl(bucket, r.newPath);
    const updated = isAvatar
      ? await replaceAvatarUrl(oldUrl, newUrl)
      : await replaceUrlsInTextTables(oldUrl, newUrl);
    if (updated > 0) dbUpdates += updated;

    if (APPLY && DELETE_OLD) {
      const { error: rmErr } = await sb.storage.from(bucket).remove([r.srcPath]);
      if (rmErr) console.error(`  ✗ delete: ${rmErr.message}`); else deleted++;
    }
  }

  console.log(`\n${bucket} 요약: 변환 ${targets.length}개 / DB 치환 ${dbUpdates}건 / 삭제 ${deleted}개`);
}

await processBucket('post-images', false);
await processBucket('avatars', true);
console.log('\n완료. --apply 없이 실행했다면 dry-run 결과만 본 것임.');
