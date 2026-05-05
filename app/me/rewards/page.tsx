import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';

export const metadata = { title: '보상 정책 — 멜른버그' };

export default function RewardsPolicyPage() {
  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/me', label: '마이페이지' },
        { label: '보상 정책', bold: true },
      ]} meta="Rewards" />

      <section className="py-12">
        <div className="max-w-[680px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">보상 정책</h1>
          <p className="text-sm text-muted mb-8">활동에 따라 mlbg 가 자동 적립됩니다. 결정론적 — AI 평가 없음.</p>

          {/* 단지 토론 */}
          <Section title="단지 토론 글" desc="20자 = 1줄 환산. \n 줄수와 글자/20 중 큰 값 적용.">
            <Row dot="#00B0F0" label="1줄 (1~20자)" value="+0" muted />
            <Row dot="#00B0F0" label="2~4줄 (21~99자)" value="+2" />
            <Row dot="#00B0F0" label="5~9줄 (100~199자)" value="+3" />
            <Row dot="#00B0F0" label="10줄+ (200자+)" value="+5" />
          </Section>

          {/* 일반 글 */}
          <Section title="커뮤니티·핫딜 글">
            <Row dot="#0070C0" label="글 작성" value="+2" />
          </Section>

          {/* 댓글 */}
          <Section title="댓글">
            <Row dot="#d4d4d4" label="단지·커뮤니티·핫딜·시설 어디든" value="+0.5" />
          </Section>

          <div className="mt-8 px-4 py-3 border border-border bg-navy-soft text-[12px] leading-relaxed text-text">
            <div className="text-navy font-bold tracking-wider uppercase text-[10px] mb-1.5">참고</div>
            <ul className="space-y-1 text-muted">
              <li>· 작성 즉시 자동 적립 — 별도 청구 불필요</li>
              <li>· 같은 글·댓글 중복 적립 방지 (한 번만 지급)</li>
              <li>· 1줄짜리 단지 토론은 +0 — 정보 가치 부족 판단</li>
              <li>· 시설(마트·노조·터미널·역) 일일 수익은 별도 — 매일 1 mlbg 누적, 위원장이 청구</li>
            </ul>
          </div>

          <div className="mt-8 flex justify-end">
            <Link href="/me" className="text-[13px] font-bold text-navy no-underline hover:underline">
              ← 마이페이지로
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-[15px] font-bold text-navy mb-1">{title}</h2>
      {desc && <p className="text-[11px] text-muted mb-2">{desc}</p>}
      <div className="border border-border">{children}</div>
    </div>
  );
}

function Row({ dot, label, value, muted }: { dot: string; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
      <span aria-hidden className="inline-block rounded-full flex-shrink-0" style={{ width: 11, height: 11, backgroundColor: dot }} />
      <span className="flex-1 text-[13px] text-text">{label}</span>
      <span className={`text-[13px] font-bold tabular-nums ${muted ? 'text-muted' : 'text-navy'}`}>{value}</span>
    </div>
  );
}
