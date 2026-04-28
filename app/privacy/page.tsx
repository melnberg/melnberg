import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';

export const metadata = {
  title: '개인정보처리방침 — 멜른버그',
  description: '멜른버그 개인정보처리방침',
};

export default function PrivacyPage() {
  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/privacy', label: '개인정보처리방침', bold: true }]} meta="Privacy" />

      <section className="pt-14 pb-20">
        <div className="max-w-[760px] mx-auto px-10">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">개인정보처리방침</h1>
          <p className="text-xs text-muted mb-8 pb-5 border-b-2 border-navy">시행일: 2026년 4월 1일</p>

          <Section title="1. 수집하는 개인정보">
            <p>멜른버그(Melnberg)는 네이버 로그인을 통해 다음 정보를 수집합니다.</p>
            <ul>
              <li>이름/닉네임 (네이버 프로필)</li>
              <li>이메일 (선택, 네이버 계정에 등록된 경우)</li>
              <li>네이버 고유 식별자 (ID)</li>
            </ul>
            <p>유료 상담·강의 결제 시 결제 정보는 PG사를 통해 처리되며, 멜른버그는 카드번호·계좌번호 등 결제 정보를 직접 저장하지 않습니다.</p>
          </Section>

          <Section title="2. 개인정보의 이용 목적">
            <ul>
              <li>서비스 회원 관리 및 본인 확인</li>
              <li>부동산 콘텐츠 제공 및 상담 응대</li>
              <li>강의·세미나 신청 및 운영</li>
              <li>서비스 개선을 위한 통계 분석</li>
              <li>고객 문의 및 피드백 응대</li>
            </ul>
          </Section>

          <Section title="3. 개인정보의 보유 및 이용 기간">
            <p>회원 탈퇴 시까지 보유하며, 탈퇴 후 즉시 파기합니다. 단, 관계 법령에 의해 보존이 필요한 경우(전자상거래법상 결제·계약 기록 5년 등) 해당 기간 동안 보관합니다.</p>
          </Section>

          <Section title="4. 개인정보의 제3자 제공">
            <p>멜른버그는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만, 법률에 의한 요청이 있는 경우는 예외로 합니다.</p>
          </Section>

          <Section title="5. 상담 및 문의 데이터">
            <ul>
              <li>이용자가 제출한 상담 내용 및 첨부 자료(매물 정보, 자산 현황 등)는 해당 상담 응대 목적으로만 사용됩니다.</li>
              <li>AI 모델 학습에 활용되지 않습니다.</li>
              <li>이용자 동의 없이 외부에 공유되지 않으며, 익명 처리된 사례로 콘텐츠에 인용할 경우 사전 동의를 받습니다.</li>
            </ul>
          </Section>

          <Section title="6. 개인정보의 안전성 확보 조치">
            <ul>
              <li>데이터 전송 시 SSL/TLS 암호화 적용</li>
              <li>접근 권한 제한 및 관리</li>
              <li>보안 헤더 적용 (HSTS, CSP 등)</li>
            </ul>
          </Section>

          <Section title="7. 이용자의 권리">
            <p>이용자는 언제든지 자신의 개인정보에 대해 열람, 수정, 삭제를 요청할 수 있으며, 회원 탈퇴를 통해 개인정보 처리를 중단할 수 있습니다.</p>
          </Section>

          <Section title="8. 개인정보 보호 책임자">
            <p>개인정보 관련 문의는 멜른버그 카페 또는 블로그(하멜른 돈벌시간) 피드백 채널을 통해 접수할 수 있습니다.</p>
          </Section>

          <p className="mt-10 pt-5 border-t border-border text-[13px] text-muted">
            <strong>부칙</strong> — 이 개인정보처리방침은 2026년 4월 1일부터 시행합니다.
          </p>
        </div>
      </section>

      <Footer />
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 terms-section">
      <h2 className="text-[17px] font-bold text-navy mb-3">{title}</h2>
      <div className="text-sm leading-loose break-keep">{children}</div>
    </div>
  );
}
