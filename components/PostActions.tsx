'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PostActions({ postId }: { postId: number }) {
  const router = useRouter();
  const supabase = createClient();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    if (!confirm('이 글을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    setDeleting(true);
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    setDeleting(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.push('/community');
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2 text-[12px]">
      <Link
        href={`/community/${postId}/edit`}
        className="font-semibold text-muted no-underline hover:text-navy"
      >
        수정
      </Link>
      <span className="text-muted">·</span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="font-semibold text-muted hover:text-red-600 cursor-pointer disabled:opacity-50 bg-transparent border-none p-0"
      >
        {deleting ? '삭제 중...' : '삭제'}
      </button>
    </span>
  );
}
