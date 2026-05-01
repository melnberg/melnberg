'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type CafePostRow = {
  id: number;
  title: string;
  external_url: string | null;
  posted_at: string | null;
  ingested_at: string;
  chunk_count: number;
};

export default function CafePostList({ posts: initial }: { posts: CafePostRow[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState(initial);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function handleDelete(id: number, title: string) {
    if (busyId) return;
    if (!confirm(`"${title}"를 삭제하시겠습니까? (관련 임베딩도 함께 삭제됨)`)) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/cafe-posts?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? '삭제 실패');
      setBusyId(null);
      return;
    }
    setPosts(posts.filter((p) => p.id !== id));
    setBusyId(null);
    router.refresh();
  }

  if (posts.length === 0) {
    return <p className="text-[13px] text-muted py-8 px-5 border border-border text-center">업로드된 글이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-bg/60 border-y border-navy text-muted">
            <th className="py-2 px-2 font-semibold text-left">제목</th>
            <th className="py-2 px-2 font-semibold text-center w-20">청크</th>
            <th className="py-2 px-2 font-semibold text-center w-28">작성일</th>
            <th className="py-2 px-2 font-semibold text-center w-32">업로드일</th>
            <th className="py-2 px-2 font-semibold text-center w-20">관리</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.id} className="border-b border-border hover:bg-bg/40">
              <td className="py-2.5 px-2">
                <div className="font-bold text-text">{p.title}</div>
                {p.external_url && (
                  <a href={p.external_url} target="_blank" rel="noopener" className="text-[11px] text-muted truncate block max-w-[480px] hover:text-navy">
                    {p.external_url}
                  </a>
                )}
              </td>
              <td className="py-2.5 px-2 text-center tabular-nums">{p.chunk_count}</td>
              <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                {p.posted_at ? new Date(p.posted_at).toLocaleDateString('ko-KR') : '-'}
              </td>
              <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                {new Date(p.ingested_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
              </td>
              <td className="py-2.5 px-2 text-center">
                <button
                  type="button"
                  onClick={() => handleDelete(p.id, p.title)}
                  disabled={busyId === p.id}
                  className="text-[11px] text-muted hover:text-red-600 cursor-pointer bg-transparent border-none p-0 disabled:opacity-50"
                >
                  {busyId === p.id ? '...' : '삭제'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
