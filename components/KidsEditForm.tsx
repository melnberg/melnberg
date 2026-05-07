'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fileToWebp } from '@/lib/image-to-webp';
import { revalidateHome } from '@/lib/revalidate-home';

type Pin = { id: number; name: string; description: string; recommended_activity: string; photo_url: string | null };

export default function KidsEditForm({ pin, currentUserId }: { pin: Pin; currentUserId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState(pin.name);
  const [description, setDescription] = useState(pin.description);
  const [recommendedActivity, setRecommendedActivity] = useState(pin.recommended_activity);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(pin.photo_url);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function handlePhoto(file: File) {
    if (file.size > 5 * 1024 * 1024) { setErr('5MB 이하 이미지만 가능합니다.'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    if (!name.trim() || !description.trim() || !recommendedActivity.trim()) { setErr('장소명/설명/추천 액티비티 모두 필수'); return; }
    setBusy(true);
    let newPhotoUrl: string | null = null;
    if (photoFile) {
      try {
        const converted = await fileToWebp(photoFile).catch(() => null);
        const blob = converted?.blob ?? photoFile;
        const isWebp = blob !== photoFile;
        const ext = isWebp ? 'webp' : (photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg');
        const contentType = isWebp ? 'image/webp' : photoFile.type;
        const path = `${currentUserId}/kids-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('post-images').upload(path, blob, { contentType });
        if (upErr) throw new Error(upErr.message);
        const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
        newPhotoUrl = publicUrl;
      } catch (e) { setErr(`사진 업로드 실패: ${e instanceof Error ? e.message : String(e)}`); setBusy(false); return; }
      // AI 검증 — 새 사진 올린 경우에만
      try {
        const r = await fetch('/api/check-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoUrl: newPhotoUrl }),
        });
        const j = await r.json() as { verdict?: 'screenshot' | 'real'; reason?: string };
        if (j.verdict === 'screenshot') {
          setErr(`AI 검증 실패 — 지도/스크린샷 사진은 등록 불가${j.reason ? ` (${j.reason})` : ''}. 캡처 말고 사진을 올려주세요.`);
          setBusy(false); return;
        }
      } catch { /* fail-open */ }
    }
    const { data, error } = await supabase.rpc('update_kids_pin', {
      p_pin_id: pin.id, p_name: name.trim(), p_description: description.trim(),
      p_recommended_activity: recommendedActivity.trim(), p_photo_url: newPhotoUrl,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { setErr(row?.out_message ?? '수정 실패'); return; }
    alert('수정 완료');
    revalidateHome();
    router.push(`/kids/${pin.id}`);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm('정말 삭제할까요?')) return;
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('delete_kids_pin', { p_pin_id: pin.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { setErr(row?.out_message ?? '삭제 실패'); return; }
    alert('삭제 완료');
    revalidateHome();
    router.push('/kids');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">장소명 *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">설명 * (200자)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={3} className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy resize-y leading-relaxed" />
        <div className="text-[10px] text-muted text-right">{description.length}/200</div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">추천 액티비티 * (200자)</label>
        <textarea value={recommendedActivity} onChange={(e) => setRecommendedActivity(e.target.value)} maxLength={200} rows={3} className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy resize-y leading-relaxed" />
        <div className="text-[10px] text-muted text-right">{recommendedActivity.length}/200</div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">사진 (변경 시만 새 파일 선택)</label>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }} className="text-[12px]" />
        {photoPreview && <img src={photoPreview} alt="" className="max-w-[300px] max-h-[200px] object-contain border border-border mt-2 rounded-xl" />}
      </div>
      {err && <div className="text-sm px-4 py-3 bg-red-50 text-red-700 border border-red-200">{err}</div>}
      <div className="flex justify-between gap-3 mt-2">
        <button type="button" onClick={handleDelete} disabled={busy} className="bg-white border border-red-300 text-red-600 px-4 py-2 text-[12px] font-bold cursor-pointer hover:bg-red-50 disabled:opacity-50">🗑 핀 삭제</button>
        <div className="flex gap-3">
          <button type="button" onClick={() => router.back()} className="bg-white border border-border text-text px-5 py-2 text-[13px] font-semibold cursor-pointer hover:border-navy hover:text-navy">취소</button>
          <button type="submit" disabled={busy} className="bg-navy text-white border-none px-6 py-2 text-[13px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-50">{busy ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </form>
  );
}
