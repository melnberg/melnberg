'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { awardMlbg } from '@/lib/mlbg-award';
import { notifyTelegram } from '@/lib/telegram-notify';
import { revalidateHome } from '@/lib/revalidate-home';
import { fileToWebp } from '@/lib/image-to-webp';

type Props = {
  initial?: { id: number; title: string; content: string; is_paid_only?: boolean };
  category?: 'community' | 'blog' | 'hotdeal' | 'stocks';
  redirectBase?: string; // '/community' | '/blog' | '/hotdeal' | '/stocks/{code}'
  stockCode?: string;    // category='stocks' 일 때만. 종목 코드. 글 INSERT 시 같이 저장.
};

export default function PostForm({ initial, category = 'community', redirectBase = '/community', stockCode }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [isPaidOnly, setIsPaidOnly] = useState(initial?.is_paid_only ?? (category === 'blog'));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 이미지 업로드 → 본문에 URL 삽입. linkify 가 자동으로 <img> 렌더.
  async function handleImageUpload(file: File) {
    if (uploading) return;
    if (file.size > 5 * 1024 * 1024) { setErr('5MB 이하 이미지만 가능합니다.'); return; }
    setErr(null);
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr('로그인이 필요합니다.'); setUploading(false); return; }
    // 용량관리 — webp 로 변환 후 업로드. gif 는 원본 유지.
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
    // 본문에 별도 줄로 URL 삽입 — linkify 가 .jpg/.png/.webp/.gif 끝나면 <img> 로 렌더
    const insert = `\n${publicUrl}\n`;
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart ?? content.length;
      const end = ta.selectionEnd ?? content.length;
      const next = content.slice(0, start) + insert + content.slice(end);
      setContent(next);
      // 커서 위치 이동
      requestAnimationFrame(() => {
        const pos = start + insert.length;
        ta.focus(); ta.setSelectionRange(pos, pos);
      });
    } else {
      setContent((c) => c + insert);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!title.trim() || !content.trim()) {
      setErr('제목과 내용을 모두 입력해주세요.');
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

    if (initial) {
      const { error } = await supabase
        .from('posts')
        .update({
          title: title.trim(),
          content: content.trim(),
          is_paid_only: category === 'blog' ? isPaidOnly : false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', initial.id);
      setLoading(false);
      if (error) {
        setErr(error.message);
        return;
      }
      revalidateHome();
      router.push(`${redirectBase}/${initial.id}`);
      router.refresh();
    } else {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: user.id,
          title: title.trim(),
          content: content.trim(),
          category,
          is_paid_only: category === 'blog' ? isPaidOnly : false,
          stock_code: category === 'stocks' && stockCode ? stockCode : null,
        })
        .select('id')
        .single();
      setLoading(false);
      if (error || !data) {
        setErr(error?.message ?? '저장 실패');
        return;
      }
      // mlbg 적립 — await 로 기다려서 상세 페이지에서 +N 즉시 보이게
      const awardKind = category === 'hotdeal' ? 'hotdeal_post' : 'community_post';
      await awardMlbg(awardKind, data.id, content.trim());
      notifyTelegram(awardKind, data.id);
      revalidateHome();
      router.push(`${redirectBase}/${data.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-[11px] font-bold tracking-widest uppercase text-muted">제목</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목을 입력하세요"
          required
          maxLength={200}
          className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[16px] outline-none focus:border-b-cyan rounded-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="content" className="text-[11px] font-bold tracking-widest uppercase text-muted">내용</label>
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
              className="text-[11px] font-bold tracking-wide text-navy hover:text-navy-dark cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-transparent border border-border hover:border-navy px-3 py-1"
            >
              {uploading ? '업로드 중...' : '📷 사진 추가'}
            </button>
          </div>
        </div>
        <textarea
          id="content"
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="내용을 입력하세요. 사진은 우측 상단 [📷 사진 추가] 버튼으로 업로드."
          required
          rows={14}
          className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none resize-y leading-relaxed"
        />
      </div>

      {category === 'blog' && (
        <label className="flex items-center gap-2.5 text-[13px] text-text cursor-pointer select-none py-1">
          <input
            type="checkbox"
            checked={isPaidOnly}
            onChange={(e) => setIsPaidOnly(e.target.checked)}
            className="w-4 h-4 accent-navy cursor-pointer"
          />
          <span>
            <span className="font-bold text-navy">조합원 전용</span>
            <span className="text-muted ml-2">— 멤버십 결제한 회원만 본문 열람 가능</span>
          </span>
        </label>
      )}

      {err && (
        <div className="text-sm px-4 py-3 break-keep leading-relaxed bg-red-50 text-red-700 border border-red-200">
          {err}
        </div>
      )}

      <div className="flex justify-end gap-3 mt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="bg-white border border-border text-text px-5 py-3 text-[13px] font-semibold tracking-wide cursor-pointer hover:border-navy hover:text-navy"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-navy text-white border-none px-6 py-3 text-[13px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '저장 중...' : initial ? '수정하기 →' : '게시하기 →'}
        </button>
      </div>
    </form>
  );
}
