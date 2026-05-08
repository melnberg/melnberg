'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateHome } from '@/lib/revalidate-home';
import { useConfirm } from '@/lib/use-confirm';

export default function PostActions({ postId, basePath = '/community' }: { postId: number; basePath?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    if (!(await confirm({ title: '이 글을 삭제할까?', body: '되돌릴 수 없음.', okLabel: '삭제', danger: true }))) return;
    setDeleting(true);
    // soft-delete: deleted_at 만 set. 피드/리스트에서 자동 숨김 + 상세는 삭제 안내
    const { error } = await supabase.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', postId);
    setDeleting(false);
    if (error) {
      alert(error.message);
      return;
    }
    revalidateHome();
    router.push(basePath);
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2 text-[12px]">
      <Link
        href={`${basePath}/${postId}/edit`}
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
