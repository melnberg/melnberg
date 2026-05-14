'use client';

// 단지 사진 갤러리 + 업로드 — AptDiscussionPanel 안에 mount.
// SQL 190 (apt_photos) + 기존 'post-images' Storage 버킷 재사용.

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fileToWebp } from '@/lib/image-to-webp';
import { useConfirm } from '@/lib/use-confirm';

type Photo = {
  id: number;
  url: string;
  caption: string | null;
  uploader_id: string;
  uploader_name: string | null;
  created_at: string;
};

export default function AptPhotosSection({ aptId }: { aptId: number }) {
  const supabase = createClient();
  const confirm = useConfirm();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Photo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setMe(user?.id ?? null);
      const { data, error } = await supabase
        .from('apt_photos')
        .select('id, url, caption, uploader_id, created_at')
        .eq('apt_master_id', aptId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(60);
      if (cancelled) return;
      if (error) {
        // SQL 190 미실행 환경 — 사일런트로 사진 섹션 자체 노출 X
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as Array<{ id: number; url: string; caption: string | null; uploader_id: string; created_at: string }>;
      // 업로더 닉네임 — 별도 fetch
      const uploaderIds = Array.from(new Set(rows.map((r) => r.uploader_id)));
      const nameMap = new Map<string, string>();
      if (uploaderIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', uploaderIds);
        for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
          nameMap.set(p.id, p.display_name ?? '익명');
        }
      }
      setPhotos(rows.map((r) => ({
        id: r.id,
        url: r.url,
        caption: r.caption,
        uploader_id: r.uploader_id,
        uploader_name: nameMap.get(r.uploader_id) ?? null,
        created_at: r.created_at,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [aptId, supabase]);

  async function handleUpload(file: File) {
    if (uploading) return;
    if (!me) { setErr('로그인이 필요합니다.'); return; }
    if (file.size > 30 * 1024 * 1024) { setErr('30MB 이하 이미지만 가능합니다.'); return; }
    setErr(null);
    setUploading(true);
    const converted = await fileToWebp(file).catch(() => null);
    const blob = converted?.blob ?? file;
    const isConverted = !!converted && blob !== file;
    const ext = isConverted ? (converted!.type === 'image/webp' ? 'webp' : 'jpg') : (file.name.split('.').pop()?.toLowerCase() ?? 'jpg');
    const contentType = isConverted ? converted!.type : file.type;
    // post-images Storage RLS — 첫 폴더가 auth.uid() 여야 통과 (SQL 105)
    const path = `${me}/apt/${aptId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('post-images').upload(path, blob, { contentType });
    if (upErr) { setErr(`업로드 실패: ${upErr.message}`); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
    const { data: row, error: insErr } = await supabase
      .from('apt_photos')
      .insert({ apt_master_id: aptId, uploader_id: me, url: publicUrl })
      .select('id, url, caption, uploader_id, created_at')
      .single();
    setUploading(false);
    if (insErr || !row) { setErr(`저장 실패: ${insErr?.message ?? '알 수 없음'}`); return; }
    // 본인 닉네임 fetch
    let myName: string | null = null;
    const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', me).maybeSingle();
    myName = (prof as { display_name: string | null } | null)?.display_name ?? null;
    setPhotos((cur) => [{
      id: row.id,
      url: row.url,
      caption: row.caption,
      uploader_id: row.uploader_id,
      uploader_name: myName,
      created_at: row.created_at,
    }, ...cur]);
  }

  async function handleDelete(p: Photo) {
    if (!(await confirm({ title: '이 사진을 삭제할까?', body: '되돌릴 수 없음.', okLabel: '삭제', danger: true }))) return;
    const { error } = await supabase
      .from('apt_photos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', p.id);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    setPhotos((cur) => cur.filter((x) => x.id !== p.id));
    if (viewer?.id === p.id) setViewer(null);
  }

  // 로딩 중에도 업로드 버튼은 노출 — 빈 단지 첫 사진 등록 가능하도록.
  return (
    <div className="mt-3 border border-border bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg/30">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-bold text-navy">📷 단지 사진</span>
          <span className="text-[10px] text-muted">{photos.length}장</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !me}
            className="text-[11px] font-bold text-navy bg-white border border-navy/40 hover:bg-navy hover:text-white px-2.5 py-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {!me ? '로그인 필요' : uploading ? '업로드 중...' : '＋ 사진 추가'}
          </button>
        </div>
      </div>

      {err && (
        <div className="px-3 py-2 text-[11px] bg-red-50 text-red-700 border-b border-red-200">{err}</div>
      )}

      <div className="p-2">
        {loading ? (
          <div className="text-[11px] text-muted text-center py-4">불러오는 중...</div>
        ) : photos.length === 0 ? (
          <div className="text-[11px] text-muted text-center py-6 leading-relaxed">
            아직 등록된 사진이 없어요.<br />
            <span className="text-[10px] text-muted/80">처음 등록하는 사람이 되어보세요.</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5" data-no-zoom>
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setViewer(p)}
                className="relative aspect-square overflow-hidden bg-bg/40 border border-border cursor-pointer p-0 group"
                style={{ aspectRatio: '1 / 1' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                {p.uploader_name && (
                  <span className="absolute bottom-0 left-0 right-0 text-[10px] text-white bg-black/55 px-1.5 py-0.5 truncate">
                    {p.uploader_name}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 라이트박스 — 클릭한 사진 큰 보기 */}
      {viewer && (
        <div
          className="fixed inset-0 z-[9000] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setViewer(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewer.url} alt="" className="max-w-full max-h-[80vh] object-contain bg-black" />
            <div className="bg-black/70 text-white text-[12px] px-3 py-2 flex items-center justify-between gap-3">
              <span>{viewer.uploader_name ?? '익명'} · {viewer.created_at.slice(0, 10)}</span>
              <div className="flex items-center gap-2">
                {me === viewer.uploader_id && (
                  <button type="button" onClick={() => handleDelete(viewer)} className="text-[11px] text-red-300 hover:text-red-100 cursor-pointer bg-transparent border-none">
                    삭제
                  </button>
                )}
                <button type="button" onClick={() => setViewer(null)} className="text-[11px] text-white/70 hover:text-white cursor-pointer bg-transparent border-none">
                  닫기 ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
