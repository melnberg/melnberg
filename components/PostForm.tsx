'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { awardMlbg } from '@/lib/mlbg-award';
import { notifyTelegram } from '@/lib/telegram-notify';

type Props = {
  initial?: { id: number; title: string; content: string; is_paid_only?: boolean };
  category?: 'community' | 'blog' | 'hotdeal';
  redirectBase?: string; // '/community' | '/blog' | '/hotdeal'
};

export default function PostForm({ initial, category = 'community', redirectBase = '/community' }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [isPaidOnly, setIsPaidOnly] = useState(initial?.is_paid_only ?? (category === 'blog'));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
        })
        .select('id')
        .single();
      setLoading(false);
      if (error || !data) {
        setErr(error?.message ?? '저장 실패');
        return;
      }
      // AI 품질 평가 + mlbg 적립 — fire-and-forget
      const awardKind = category === 'hotdeal' ? 'hotdeal_post' : category === 'blog' ? 'community_post' : 'community_post';
      void awardMlbg(awardKind, data.id, content.trim());
      notifyTelegram(awardKind, data.id);
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
        <label htmlFor="content" className="text-[11px] font-bold tracking-widest uppercase text-muted">내용</label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="내용을 입력하세요"
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
