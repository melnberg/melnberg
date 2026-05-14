'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fileToWebp } from '@/lib/image-to-webp';

const MAX_BYTES = 30 * 1024 * 1024;

export default function MyFeedbackComposer() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageUpload(file: File) {
    if (uploading) return;
    if (file.size > MAX_BYTES) { setErr('30MB 이하 이미지만 첨부 가능.'); return; }
    setErr(null);
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr('로그인이 필요합니다.'); setUploading(false); return; }
    const converted = await fileToWebp(file).catch(() => null);
    const blob = converted?.blob ?? file;
    const isConverted = !!converted && blob !== file;
    const ext = isConverted ? (converted!.type === 'image/webp' ? 'webp' : 'jpg') : (file.name.split('.').pop()?.toLowerCase() ?? 'jpg');
    const contentType = isConverted ? converted!.type : file.type;
    const path = `${user.id}/feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('post-images').upload(path, blob, { contentType });
    setUploading(false);
    if (upErr) { setErr(`업로드 실패: ${upErr.message}`); return; }
    const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
    setImages((cur) => [...cur, publicUrl]);
  }

  function removeImage(url: string) {
    setImages((cur) => cur.filter((u) => u !== url));
  }

  async function submit() {
    if (busy) return;
    const text = message.trim();
    if (!text && images.length === 0) { setErr('내용을 입력하거나 이미지를 첨부하세요.'); return; }
    if (text.length > 2000) { setErr('2000자 이내로 입력해주세요.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErr('로그인이 필요합니다.'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
      const displayName = (profile as { display_name?: string | null } | null)?.display_name ?? null;
      const { error } = await supabase.from('feedback').insert({
        user_id: user.id,
        email: user.email ?? null,
        display_name: displayName,
        message: text || '(이미지 첨부)',
        image_urls: images.length > 0 ? images : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
        page_url: typeof window !== 'undefined' ? window.location.href.slice(0, 500) : null,
      });
      if (error) { setErr(`전송 실패: ${error.message}`); return; }
      setDone(true);
      setMessage('');
      setImages([]);
      setTimeout(() => {
        setDone(false);
        setOpen(false);
        router.refresh();
      }, 1200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full bg-navy text-white px-4 py-3 text-[14px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark border-none"
        >
          + 건의하기
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 border border-navy bg-white">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-navy text-white">
        <div className="text-[13px] font-bold">새 건의 작성</div>
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); }}
          aria-label="닫기"
          className="text-white/80 hover:text-white text-[16px] leading-none bg-transparent border-none cursor-pointer"
        >
          ✕
        </button>
      </div>
      <div className="px-4 py-3">
        {done ? (
          <div className="text-[13px] text-cyan font-bold py-6 text-center">감사합니다. 빠르게 확인하겠습니다.</div>
        ) : (
          <>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="버그·오류·개선 제안 등 자유롭게 적어주세요. 이미지도 첨부 가능 (30MB 이하)."
              className="w-full border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-navy resize-none"
              autoFocus
            />

            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {images.map((url) => (
                  <div key={url} className="relative w-24 h-24 border border-border bg-bg/30 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="첨부" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(url)}
                      aria-label="첨부 삭제"
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-[14px] leading-none flex items-center justify-center cursor-pointer border-none hover:bg-black/90"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {err && <div className="text-[11px] text-red-700 mt-2">{err}</div>}

            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageUpload(f);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-[11px] font-bold tracking-wide text-navy hover:text-navy-dark cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-transparent border border-border hover:border-navy px-3 py-1.5"
                >
                  {uploading ? '업로드 중...' : '📷 사진 추가'}
                </button>
                <span className="text-[10px] text-muted">{message.length}/2000</span>
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={busy || uploading || (!message.trim() && images.length === 0)}
                className="bg-navy text-white px-4 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-40 border-none"
              >
                {busy ? '전송 중...' : '보내기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
