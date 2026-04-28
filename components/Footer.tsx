import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-border pt-9 pb-7 text-xs text-muted leading-relaxed">
      <div className="max-w-content mx-auto px-10">
        <div className="flex justify-between items-center mb-5 pb-5 border-b border-border">
          <span className="text-[13px] font-bold text-text tracking-tight">멜른버그</span>
          <div className="flex gap-5">
            <Link href="/blog" className="text-muted no-underline hover:text-text">블로그</Link>
            <Link href="/terms" className="text-muted no-underline hover:text-text">이용약관</Link>
            <Link href="/privacy" className="text-muted no-underline hover:text-text">개인정보처리방침</Link>
          </div>
        </div>
        <div className="mb-3.5 text-[10px] leading-relaxed" style={{ color: '#BFBFBF' }}>
          <p>안세 | 대표 임은종 | 사업자등록번호 763-20-02086 | 통신판매업 2023-용인기흥-4231 | 서울특별시 성동구 상원12길 30, 307호</p>
        </div>
        <div className="mb-5">
          <p className="font-semibold text-text">고객센터</p>
          <p>0507-1437-9196 | 운영시간 10:00–18:00 (주말/공휴일 휴무)</p>
        </div>
        <p className="text-[11px] text-muted opacity-70">© 2026 melnberg. All rights reserved.</p>
      </div>
    </footer>
  );
}
