'use client';

// 스레드 작성 폼 — 본인 페이지 / 단독 스레드(답글) 에서 사용.
// textarea + 이미지 첨부 + 글자수 카운터.
// parentId 가 있으면 답글, 없으면 새 스레드.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fileToWebp } from '@/lib/image-to-webp';

type Props = {
  /** 답글이면 부모 thread id, 아니면 null */
  parentId?: number | null;
  /** 작성 후 라우터 refresh — 기본 true */
  refreshOnSubmit?: boolean;
  placeholder?: string;
};

const MAX_LEN = 1000;

export default function ThreadComposer({ parentId = null, refreshOnSubmit = true, placeholder }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleImageUpload(file: File) {
    if (uploading) return;
    if (file.size > 5 * 1024 * 1024) { setErr('5MB 이하 이미지만 가능합니다.'); return; }
    setErr(null);
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr('로그인이 필요합니다.'); setUploading(false); return; }
    const converted = await fileToWebp(file).catch(() => null);
    const blob = converted?.blob ?? file;
    const isWebp = blob !== file;
    const ext = isWebp ? 'webp' : (file.name.split('.').pop()?.toLowerCase() ?? 'jpg');
    const contentType = isWebp ? 'image/webp' : file.type;
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('post-images').upload(path, blob, { contentType });
    setUploading(false);
    if (upErr) { setErr(`업로드 실패: ${upErr.message}`); return; }
    const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
    setAttachedImages((cur) => [...cur, publicUrl]);
  }

  function removeAttached(url: string) {
    setAttachedImages((cur) => cur.filter((u) => u !== url));
  }

  function composeFinalContent(): string {
    const body = content.trim();
    if (attachedImages.length === 0) return body;
    return body + '\n\n' + attachedImages.join('\n');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const finalContent = composeFinalContent();
    if (!finalContent) {
      setErr('내용을 입력해주세요.');
      return;
    }
    if (finalContent.length > MAX_LEN) {
      setErr(`${MAX_LEN}자 이내로 작성해주세요.`);
      return;
    }
    setErr(null);
    setLoading(true);

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      setLoading(false);
      setErr('로그인이 필요합니다.');
      return;
    }

    const { error } = await supabase.from('threads').insert({
      author_id: user.id,
      content: finalContent,
      parent_id: parentId,
    });

    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setContent('');
    setAttachedImages([]);
    if (refreshOnSubmit) router.refresh();
  }

  const remaining = MAX_LEN - content.length;
  const overLimit = remaining < 0;

  return (
    <form onSubmit={handleSubmit} className="border border-border bg-white p-4 mb-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder ?? (parentId ? '답글 작성...' : '무슨 일이 있었어?')}
        rows={parentId ? 2 : 3}
        maxLength={MAX_LEN + 200} // 약간 여유 — 검사로 차단
        className="w-full resize-none border-0 outline-none text-[14px] text-text placeholder:text-muted bg-transparent"
      />
      {attachedImages.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {attachedImages.map((url) => (
            <div key={url} className="relative">
              <img src={url} alt="" className="w-20 h-20 object-cover border border-border" />
              <button
                type="button"
                onClick={() => removeAttached(url)}
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-navy text-white text-[11px] font-bold leading-none flex items-center justify-center"
                title="첨부 제거"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {err && <div className="text-[11px] text-red-500 mt-2">{err}</div>}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-[12px] text-muted hover:text-navy disabled:opacity-50"
            title="이미지 첨부"
          >
            {uploading ? '업로드중...' : '이미지'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImageUpload(f);
              e.target.value = '';
            }}
          />
          <span className={`text-[11px] tabular-nums ${overLimit ? 'text-red-500 font-bold' : 'text-muted'}`}>
            {remaining}
          </span>
        </div>
        <button
          type="submit"
          disabled={loading || overLimit || (!content.trim() && attachedImages.length === 0)}
          className="bg-navy text-white px-4 py-1.5 text-[12px] font-bold hover:bg-navy-dark disabled:opacity-50"
        >
          {loading ? '게시중...' : (parentId ? '답글' : '게시')}
        </button>
      </div>
    </form>
  );
}
