'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { awardMlbg } from '@/lib/mlbg-award';
import { notifyTelegram } from '@/lib/telegram-notify';
import { revalidateHome } from '@/lib/revalidate-home';
import { fileToWebp } from '@/lib/image-to-webp';
import StockPicker from './StockPicker';

type Props = {
  initial?: { id: number; title: string; content: string; is_paid_only?: boolean; stock_code?: string | null };
  category?: 'community' | 'blog' | 'hotdeal' | 'stocks' | 'realty' | 'worry';
  redirectBase?: string;
};

export default function PostForm({ initial, category = 'community', redirectBase = '/community' }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [isPaidOnly, setIsPaidOnly] = useState(initial?.is_paid_only ?? (category === 'blog'));
  // stocks 카테고리 — 종목 태그 (자유 입력, 선택)
  const [stockTag, setStockTag] = useState(initial?.stock_code ?? '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // 첨부 이미지 — URL 텍스트는 본문에 안 박고 별도 thumbnail 로 미리보기. 제출 시 본문 끝에 자동 append.
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  // 투표 — 글 작성 시 선택적으로 추가. 수정(initial)에선 비활성.
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // 본문 + 첨부 이미지 URL → 최종 저장될 텍스트
  function composeFinalContent(): string {
    const body = content.trim();
    if (attachedImages.length === 0) return body;
    return body + '\n\n' + attachedImages.join('\n');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const finalContent = composeFinalContent();
    if (!title.trim() || !finalContent) {
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
          content: finalContent,
          is_paid_only: category === 'blog' ? isPaidOnly : false,
          stock_code: category === 'stocks' ? (stockTag.trim() || null) : null,
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
          content: finalContent,
          category,
          is_paid_only: category === 'blog' ? isPaidOnly : false,
          stock_code: category === 'stocks' ? (stockTag.trim() || null) : null,
        })
        .select('id')
        .single();
      setLoading(false);
      if (error || !data) {
        setErr(error?.message ?? '저장 실패');
        return;
      }
      const awardKind = category === 'hotdeal' ? 'hotdeal_post' : 'community_post';
      await awardMlbg(awardKind, data.id, finalContent);
      notifyTelegram(awardKind, data.id);

      // 투표 옵션 추가 — 실패해도 글 자체는 살아있음 (alert 만)
      if (pollEnabled) {
        const cleaned = pollOptions.map((s) => s.trim()).filter((s) => s.length > 0);
        if (cleaned.length >= 2 && cleaned.length <= 6) {
          const { data: pollResp, error: pollErr } = await supabase.rpc('create_post_poll', {
            p_post_id: data.id,
            p_question: pollQuestion.trim() || null,
            p_options: cleaned,
          });
          const pollRow = Array.isArray(pollResp) ? pollResp[0] : pollResp;
          if (pollErr) {
            alert(`투표 등록 실패 (글은 정상 게시됨): ${pollErr.message}`);
          } else if (pollRow && pollRow.out_success === false) {
            alert(`투표 등록 실패 (글은 정상 게시됨): ${pollRow.out_message ?? '알 수 없는 오류'}`);
          }
        } else {
          alert('투표는 옵션이 2~6개 필요합니다 — 글만 게시되었어요.');
        }
      }

      revalidateHome();
      router.push(`${redirectBase}/${data.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {category === 'stocks' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold tracking-widest uppercase text-muted">
            종목 <span className="text-muted normal-case font-normal">(선택 — 검색해서 첨부하면 가격·차트가 글에 표시됨)</span>
          </label>
          <StockPicker initial={stockTag || undefined} onChange={(c) => setStockTag(c ?? '')} />
        </div>
      )}
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
          {category !== 'worry' && (
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
          )}
        </div>
        <textarea
          id="content"
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={category === 'worry' ? '고민 내용을 입력하세요. 익명으로 등록됨.' : '내용을 입력하세요. 사진은 우측 상단 [📷 사진 추가] 버튼으로 업로드 (썸네일로 미리보기).'}
          rows={14}
          className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none resize-y leading-relaxed"
        />
        {/* 첨부 이미지 썸네일 미리보기 — 게시 시 본문 끝에 자동 추가됨 */}
        {attachedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {attachedImages.map((url) => (
              <div key={url} className="relative w-24 h-24 border border-border bg-bg/30 overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="첨부" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAttached(url)}
                  aria-label="첨부 삭제"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-[14px] leading-none flex items-center justify-center cursor-pointer border-none hover:bg-black/90"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
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

      {/* 투표 — 새 글 작성 시에만 (수정에선 비활성) */}
      {!initial && (
        <div className="border border-border p-4 bg-bg/30">
          <label className="flex items-center gap-2.5 text-[13px] text-text cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pollEnabled}
              onChange={(e) => setPollEnabled(e.target.checked)}
              className="w-4 h-4 accent-navy cursor-pointer"
            />
            <span className="font-bold text-navy">🎰 mlbg 베팅 추가</span>
            <span className="text-muted text-[12px]">— 옵션 2~6개. 사용자들이 mlbg 걸고 베팅. 정답 결정 시 배당률대로 정산.</span>
          </label>
          {pollEnabled && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold tracking-widest uppercase text-muted">
                  질문 <span className="normal-case font-normal">(선택 — 비우면 글 제목)</span>
                </label>
                <input
                  type="text"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="질문을 입력하세요"
                  maxLength={200}
                  className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy rounded-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold tracking-widest uppercase text-muted">옵션</label>
                <div className="flex flex-col gap-2">
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-muted w-5 shrink-0">{i + 1}.</span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const next = pollOptions.slice();
                          next[i] = e.target.value;
                          setPollOptions(next);
                        }}
                        placeholder={`옵션 ${i + 1}`}
                        maxLength={100}
                        className="flex-1 border border-border px-3 py-2 text-[14px] outline-none focus:border-navy rounded-none"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                          aria-label="옵션 삭제"
                          className="text-[14px] w-7 h-7 flex items-center justify-center bg-white border border-border text-muted hover:text-red-600 hover:border-red-300 cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="self-start mt-1 text-[12px] font-bold text-navy bg-transparent border border-border hover:border-navy px-3 py-1.5 cursor-pointer"
                  >
                    + 옵션 추가
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
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
