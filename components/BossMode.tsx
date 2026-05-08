'use client';

// 보스 모드 — 회사에서 멜른버그 켜놓고 있을 때 한 클릭으로 화면을 위장.
// 카카오톡의 엑셀모드와 같은 컨셉. 3종 (Excel / 한글 / Word).
//
// - 우측 상단 버튼 3개. 누르면 풀스크린 오버레이 (z-[10000]) 로 진짜 작업 화면처럼 위장.
// - 끄기: Esc 키 / 좌상단 빨간 닫기 버튼 (작게 — 진짜 윈도우 닫기처럼).
// - localStorage 'melnberg-boss-mode' 에 마지막 모드 기억 (다음 페이지에서도 유지).
//
// MVP — 실제 커뮤니티 피드 통합은 v2. 지금은 정적 fake content (엑셀 셀 / 한글 본문 / Word 본문).

import { useEffect, useState } from 'react';

type Mode = 'excel' | 'hwp' | 'word' | null;

const STORAGE_KEY = 'melnberg-boss-mode';

export default function BossMode() {
  const [mode, setMode] = useState<Mode>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'excel' || saved === 'hwp' || saved === 'word') setMode(saved);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      if (mode) localStorage.setItem(STORAGE_KEY, mode);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* noop */ }
  }, [mode, mounted]);

  // Esc 로 위장 모드 해제
  useEffect(() => {
    if (!mode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMode(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  if (!mounted) return null;

  return (
    <>
      {/* 트리거 버튼 — 위장 모드 OFF 일 때만 노출. 우측 상단, 베팅중 배지보다 살짝 아래. */}
      {!mode && (
        <div className="fixed top-12 right-2 z-50 flex flex-col gap-1 items-end">
          <span className="text-[9px] font-bold tracking-widest uppercase text-muted/70 bg-white/80 px-1.5 py-0.5 rounded-sm pointer-events-none">
            🎭 위장 모드
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setMode('excel')}
              className="px-2 py-1 text-[10px] font-bold bg-white border border-[#107c41] text-[#107c41] hover:bg-[#107c41] hover:text-white cursor-pointer rounded-sm shadow-sm"
              title="Excel 위장 (Esc 로 해제)"
            >
              📗 Excel
            </button>
            <button
              type="button"
              onClick={() => setMode('hwp')}
              className="px-2 py-1 text-[10px] font-bold bg-white border border-[#0066b3] text-[#0066b3] hover:bg-[#0066b3] hover:text-white cursor-pointer rounded-sm shadow-sm"
              title="한글 위장 (Esc 로 해제)"
            >
              📘 한글
            </button>
            <button
              type="button"
              onClick={() => setMode('word')}
              className="px-2 py-1 text-[10px] font-bold bg-white border border-[#2b579a] text-[#2b579a] hover:bg-[#2b579a] hover:text-white cursor-pointer rounded-sm shadow-sm"
              title="Word 위장 (Esc 로 해제)"
            >
              📄 Word
            </button>
          </div>
        </div>
      )}

      {/* 풀스크린 오버레이 — 모드별 분기 */}
      {mode === 'excel' && <ExcelDisguise onClose={() => setMode(null)} />}
      {mode === 'hwp' && <HangulDisguise onClose={() => setMode(null)} />}
      {mode === 'word' && <WordDisguise onClose={() => setMode(null)} />}
    </>
  );
}

// ─── 공통 ───────────────────────────────────────────────
function PanicCorner({ onClose }: { onClose: () => void }) {
  // 좌상단 보스버튼 — 작고 눈에 안 띄게. Esc 와 동일.
  return (
    <button
      type="button"
      onClick={onClose}
      title="위장 해제 (Esc)"
      aria-label="위장 해제"
      className="fixed top-1 left-1 z-[10001] w-3 h-3 cursor-pointer bg-transparent border-none p-0 m-0 opacity-0 hover:opacity-100"
      style={{ background: 'transparent' }}
    >
      <span className="block w-full h-full bg-red-500" />
    </button>
  );
}

// ─── EXCEL ──────────────────────────────────────────────
function ExcelDisguise({ onClose }: { onClose: () => void }) {
  // 가짜 엑셀 데이터 — 월간 매출 대시보드 톤
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const headers = ['부서', '담당자', '1월', '2월', '3월', '4월', 'Q1합계', '4월 누계', '전월대비', '목표', '달성률', '비고'];
  const data: Array<(string | number)[]> = [
    ['영업1팀', '김대리', 12_400_000, 14_800_000, 13_200_000, 15_900_000, 40_400_000, 56_300_000, '+20%', 18_000_000, '88.3%', '신규고객 확보'],
    ['영업1팀', '박과장', 18_700_000, 21_300_000, 19_800_000, 22_400_000, 59_800_000, 82_200_000, '+13%', 22_000_000, '101.8%', '대형 계약 마감'],
    ['영업2팀', '이주임', 9_200_000, 8_700_000, 10_100_000, 11_600_000, 28_000_000, 39_600_000, '+15%', 12_000_000, '96.7%', '재계약 진행'],
    ['영업2팀', '최팀장', 24_100_000, 26_900_000, 25_300_000, 28_700_000, 76_300_000, 105_000_000, '+13%', 28_000_000, '102.5%', '리뉴얼 PT 통과'],
    ['마케팅', '정대리', 6_800_000, 7_200_000, 7_900_000, 8_400_000, 21_900_000, 30_300_000, '+6%', 10_000_000, '84.0%', '광고 효율 개선'],
    ['마케팅', '한과장', 11_300_000, 12_600_000, 13_500_000, 14_900_000, 37_400_000, 52_300_000, '+10%', 15_000_000, '99.3%', 'B2B 캠페인 시작'],
    ['기획', '강대리', 8_900_000, 9_400_000, 8_600_000, 10_200_000, 26_900_000, 37_100_000, '+18%', 11_000_000, '92.7%', '신규 라인업 검토'],
    ['기획', '윤차장', 15_600_000, 14_900_000, 16_700_000, 17_300_000, 47_200_000, 64_500_000, '+3%', 18_000_000, '96.1%', '연간 로드맵 확정'],
    ['CS', '서주임', 4_200_000, 4_800_000, 5_100_000, 5_600_000, 14_100_000, 19_700_000, '+9%', 6_000_000, '93.3%', '응대시간 단축'],
    ['CS', '오과장', 7_100_000, 7_500_000, 8_300_000, 8_700_000, 22_900_000, 31_600_000, '+4%', 9_000_000, '96.6%', 'NPS +12pt'],
    ['전략', '홍부장', 32_400_000, 35_700_000, 34_100_000, 38_200_000, 102_200_000, 140_400_000, '+12%', 38_000_000, '100.5%', 'M&A 1건 완료'],
    ['전략', '백수석', 28_900_000, 31_200_000, 29_500_000, 33_400_000, 89_600_000, 123_000_000, '+13%', 34_000_000, '98.2%', '해외법인 안정화'],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['합계', '', 179_600_000, 195_200_000, 192_100_000, 215_300_000, 566_900_000, 782_200_000, '+12%', 221_000_000, '97.4%', ''],
  ];

  function fmt(v: string | number): string {
    if (typeof v === 'number') return v.toLocaleString();
    return v;
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-[#f3f3f3] flex flex-col select-none" style={{ fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif' }}>
      <PanicCorner onClose={onClose} />
      {/* 타이틀바 */}
      <div className="flex items-center justify-between bg-[#107c41] text-white text-[12px] h-[28px] px-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px]">📗</span>
          <span className="font-bold">월간_매출_대시보드_2026Q2_v3_FINAL_수정본_(공유).xlsx · Excel</span>
        </div>
        <div className="flex items-center gap-3 text-[12px]">
          <span>김민지 (Microsoft 365)</span>
          <span className="opacity-70">— □ ✕</span>
        </div>
      </div>
      {/* 메뉴 */}
      <div className="flex items-center bg-white text-[12px] border-b border-[#d4d4d4] h-[24px] px-2 gap-3 text-[#444]">
        {['파일', '홈', '삽입', '그리기', '페이지 레이아웃', '수식', '데이터', '검토', '보기', '자동화', '도움말'].map((m, i) => (
          <span key={i} className={i === 1 ? 'border-b-2 border-[#107c41] font-bold text-[#107c41] pb-px' : 'hover:bg-[#e5f3ec] px-1 py-px'}>{m}</span>
        ))}
      </div>
      {/* 리본 */}
      <div className="bg-white border-b border-[#d4d4d4] h-[88px] px-3 py-2 flex items-stretch gap-4 text-[10px]">
        <RibbonGroup label="클립보드">
          <RibbonBtn icon="📋" label="붙여넣기" big />
          <div className="flex flex-col gap-0.5">
            <RibbonBtn icon="✂️" label="잘라내기" />
            <RibbonBtn icon="📑" label="복사" />
            <RibbonBtn icon="🖌️" label="서식 복사" />
          </div>
        </RibbonGroup>
        <RibbonGroup label="글꼴">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <select className="border border-[#d4d4d4] text-[11px] px-1 py-0.5 bg-white w-[110px]"><option>맑은 고딕</option></select>
              <select className="border border-[#d4d4d4] text-[11px] px-1 py-0.5 bg-white w-[44px]"><option>11</option></select>
            </div>
            <div className="flex items-center gap-0.5">
              {['B', 'I', 'U', '⌐', '✏', '🎨'].map((s, i) => <span key={i} className="w-5 h-5 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[11px] cursor-default">{s}</span>)}
            </div>
          </div>
        </RibbonGroup>
        <RibbonGroup label="맞춤">
          <div className="flex items-center gap-0.5">
            {['↑', '−', '↓', '⫶', '←', '≡', '→'].map((s, i) => <span key={i} className="w-5 h-5 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[11px] cursor-default">{s}</span>)}
          </div>
        </RibbonGroup>
        <RibbonGroup label="표시 형식">
          <select className="border border-[#d4d4d4] text-[11px] px-1 py-0.5 bg-white w-[100px]"><option>회계</option></select>
          <div className="flex items-center gap-0.5 mt-1">
            {['₩', '%', ',', '.0', '0.'].map((s, i) => <span key={i} className="w-5 h-5 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[11px] cursor-default">{s}</span>)}
          </div>
        </RibbonGroup>
        <RibbonGroup label="스타일">
          <div className="flex items-center gap-0.5">
            <span className="px-1.5 py-2 border border-[#d4d4d4] bg-[#fff2cc] text-[10px]">조건부<br />서식</span>
            <span className="px-1.5 py-2 border border-[#d4d4d4] bg-[#dde8ed] text-[10px]">표 서식</span>
            <span className="px-1.5 py-2 border border-[#d4d4d4] bg-[#e2efda] text-[10px]">셀 스타일</span>
          </div>
        </RibbonGroup>
        <RibbonGroup label="셀">
          <div className="flex items-center gap-0.5">
            {['삽입', '삭제', '서식'].map((s, i) => <span key={i} className="px-2 py-3 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[10px] cursor-default">{s}</span>)}
          </div>
        </RibbonGroup>
      </div>
      {/* 이름박스 + 수식 입력줄 */}
      <div className="flex items-center bg-white border-b border-[#d4d4d4] h-[24px] text-[11px]">
        <div className="flex items-center px-2 border-r border-[#d4d4d4] w-[140px] gap-2">
          <span className="text-[#444]">G14</span>
          <span className="text-[#888]">▼</span>
        </div>
        <div className="flex items-center px-2 border-r border-[#d4d4d4] gap-2 text-[#888]">
          <span>fx</span>
        </div>
        <div className="flex-1 px-2 text-[#444] tabular-nums">=SUM(C14:F14)</div>
      </div>
      {/* 그리드 */}
      <div className="flex-1 overflow-auto bg-white text-[12px] tabular-nums" style={{ fontFamily: '"맑은 고딕", "Malgun Gothic", sans-serif' }}>
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-[#e6e6e6] border border-[#c2c2c2] w-[36px] h-[20px] text-[#666] font-normal"></th>
              {cols.map((c) => (
                <th key={c} className="sticky top-0 z-10 bg-[#e6e6e6] border border-[#c2c2c2] w-[110px] h-[20px] text-[#222] font-normal">{c}</th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-[#e6e6e6] border border-[#c2c2c2] w-[36px] h-[22px] text-[#666] font-normal">1</th>
              {headers.map((h, i) => (
                <td key={i} className="border border-[#d4d4d4] px-2 h-[22px] font-bold text-white text-center" style={{ background: '#107c41' }}>{h}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rIdx) => (
              <tr key={rIdx}>
                <th className="sticky left-0 z-10 bg-[#e6e6e6] border border-[#c2c2c2] w-[36px] h-[22px] text-[#666] font-normal">{rIdx + 2}</th>
                {row.map((cell, cIdx) => {
                  const isTotal = row[0] === '합계';
                  const num = typeof cell === 'number';
                  return (
                    <td
                      key={cIdx}
                      className={`border border-[#d4d4d4] px-2 h-[22px] ${isTotal ? 'bg-[#fff2cc] font-bold' : 'bg-white'} ${num ? 'text-right' : ''} ${cIdx === 8 && typeof cell === 'string' && cell.startsWith('+') ? 'text-[#0070c0]' : ''}`}
                    >
                      {fmt(cell)}
                    </td>
                  );
                })}
                {/* 빈 셀 */}
                {Array.from({ length: cols.length - row.length }).map((_, i) => (
                  <td key={`e${i}`} className="border border-[#d4d4d4] px-2 h-[22px] bg-white"></td>
                ))}
              </tr>
            ))}
            {/* 빈 행 채우기 */}
            {Array.from({ length: 30 }).map((_, rIdx) => (
              <tr key={`empty-${rIdx}`}>
                <th className="sticky left-0 z-10 bg-[#e6e6e6] border border-[#c2c2c2] w-[36px] h-[22px] text-[#666] font-normal">{data.length + 2 + rIdx}</th>
                {cols.map((c) => <td key={c} className="border border-[#d4d4d4] px-2 h-[22px] bg-white"></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 시트 탭 */}
      <div className="flex items-center bg-[#f3f3f3] border-t border-[#d4d4d4] h-[22px] text-[11px] px-2 gap-1">
        <span className="px-2 py-px bg-white border border-[#d4d4d4] border-b-0 -mb-px font-bold">Q2_매출</span>
        <span className="px-2 py-px text-[#444]">Q1_매출</span>
        <span className="px-2 py-px text-[#444]">전년동기</span>
        <span className="px-2 py-px text-[#444]">목표대비</span>
        <span className="px-2 py-px text-[#444]">+</span>
      </div>
      {/* 상태바 */}
      <div className="flex items-center justify-between bg-[#107c41] text-white text-[11px] h-[20px] px-3">
        <div className="flex items-center gap-3">
          <span>준비</span>
          <span>·</span>
          <span>접근성: 조사하세요</span>
        </div>
        <div className="flex items-center gap-3">
          <span>평균: 12,847,083</span>
          <span>개수: 12</span>
          <span>합계: 154,165,000</span>
          <span>·</span>
          <span>⊞ 100%</span>
        </div>
      </div>
    </div>
  );
}

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-between border-r border-[#e0e0e0] pr-3 last:border-r-0">
      <div className="flex items-center gap-1 flex-1 pt-1">{children}</div>
      <div className="text-[9px] text-[#888] mt-1">{label}</div>
    </div>
  );
}

function RibbonBtn({ icon, label, big }: { icon: string; label: string; big?: boolean }) {
  return (
    <div className={`flex ${big ? 'flex-col items-center w-[44px] py-1' : 'items-center gap-1 px-1 py-0.5'} border border-transparent hover:border-[#d4d4d4] cursor-default`}>
      <span className={big ? 'text-[18px]' : 'text-[12px]'}>{icon}</span>
      <span className={`text-[${big ? 9 : 10}px] text-[#444]`}>{label}</span>
    </div>
  );
}

// ─── 한글 (HWP) ─────────────────────────────────────────
function HangulDisguise({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10000] bg-[#e8e8e8] flex flex-col select-none" style={{ fontFamily: '"맑은 고딕", "Malgun Gothic", sans-serif' }}>
      <PanicCorner onClose={onClose} />
      {/* 타이틀바 */}
      <div className="flex items-center justify-between bg-[#0066b3] text-white text-[12px] h-[26px] px-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px]">📘</span>
          <span className="font-bold">[2026.05.08] Q2_프로젝트현황보고_(0판)_김민지대리.hwpx · 한글 2024</span>
        </div>
        <div className="opacity-80">— □ ✕</div>
      </div>
      {/* 메뉴 */}
      <div className="flex items-center bg-[#f3f3f3] text-[12px] border-b border-[#c4c4c4] h-[22px] px-2 gap-3 text-[#333]">
        {['파일', '편집', '보기', '입력', '서식', '쪽', '보안', '검토', '도구', '표', '창', '도움말'].map((m) => <span key={m} className="hover:bg-white px-1 py-px">{m}</span>)}
      </div>
      {/* 도구상자 */}
      <div className="bg-[#f3f3f3] border-b border-[#c4c4c4] px-2 py-1 flex items-center gap-1 text-[11px]">
        <select className="border border-[#bbb] bg-white px-1 py-0.5 w-[120px]"><option>본문</option></select>
        <select className="border border-[#bbb] bg-white px-1 py-0.5 w-[120px]"><option>함초롬바탕</option></select>
        <select className="border border-[#bbb] bg-white px-1 py-0.5 w-[50px]"><option>10.0</option></select>
        <span className="mx-1 text-[#bbb]">|</span>
        {['B', 'I', 'U', 'S', 'A̲'].map((s, i) => <span key={i} className="w-6 h-6 border border-transparent hover:border-[#bbb] bg-white flex items-center justify-center cursor-default">{s}</span>)}
        <span className="mx-1 text-[#bbb]">|</span>
        {['≡', '≢', '≣', '⏐'].map((s, i) => <span key={i} className="w-6 h-6 border border-transparent hover:border-[#bbb] bg-white flex items-center justify-center cursor-default">{s}</span>)}
        <span className="mx-1 text-[#bbb]">|</span>
        <span className="px-2 py-1 border border-[#bbb] bg-white">표 ▾</span>
        <span className="px-2 py-1 border border-[#bbb] bg-white">그림</span>
        <span className="px-2 py-1 border border-[#bbb] bg-white">도형 ▾</span>
        <span className="px-2 py-1 border border-[#bbb] bg-white">차트 ▾</span>
        <span className="ml-auto text-[10px] text-[#666]">자동저장: 14:38</span>
      </div>
      {/* 본문 — 가운데 종이 */}
      <div className="flex-1 overflow-auto py-6">
        <div className="mx-auto bg-white shadow-md text-[13px] text-[#222]" style={{ width: '794px', minHeight: '1123px', padding: '64px 72px', lineHeight: 1.85 }}>
          <div className="text-right text-[11px] text-[#666]">문서번호: ATR-2026-Q2-118</div>
          <div className="text-right text-[11px] text-[#666] mb-8">시행일자: 2026. 05. 08.</div>

          <h1 className="text-center text-[24px] font-bold mb-2 tracking-tight">2026년 2분기 프로젝트 현황 보고</h1>
          <div className="text-center text-[12px] text-[#666] mb-10">— 신사업본부 / 전략기획팀 —</div>

          <p className="mb-1"><b>1. 보고 목적</b></p>
          <p className="mb-4 pl-4">2026년 2분기 핵심 프로젝트 진행 상황을 점검하고, 일정 지연 요인 및 후속 대응 방안을 공유하기 위해 본 보고서를 작성함.</p>

          <p className="mb-1"><b>2. 주요 프로젝트 현황</b></p>
          <table className="w-full text-[12px] border border-[#444] border-collapse mb-4">
            <thead>
              <tr>
                <th className="border border-[#444] bg-[#dceaf6] py-1 px-2">No.</th>
                <th className="border border-[#444] bg-[#dceaf6] py-1 px-2">프로젝트명</th>
                <th className="border border-[#444] bg-[#dceaf6] py-1 px-2">주관</th>
                <th className="border border-[#444] bg-[#dceaf6] py-1 px-2">진행률</th>
                <th className="border border-[#444] bg-[#dceaf6] py-1 px-2">목표일</th>
                <th className="border border-[#444] bg-[#dceaf6] py-1 px-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['1', 'BFB-22 차세대 결제 게이트웨이', '결제팀', '78%', '06.30', '정상'],
                ['2', 'CRM 통합 마이그레이션', 'IT전략', '64%', '07.15', '주의'],
                ['3', '글로벌 e-Commerce 오픈', '해외사업', '52%', '08.20', '지연'],
                ['4', '내부 ERP 모듈 고도화', 'IT운영', '91%', '06.10', '정상'],
                ['5', '고객데이터 통합 (CDP)', '데이터팀', '45%', '09.30', '정상'],
                ['6', '브랜드 리뉴얼 — Phase 2', '마케팅', '33%', '08.05', '주의'],
              ].map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={`border border-[#444] py-1 px-2 ${j === 5 && c === '지연' ? 'text-[#c00]' : j === 5 && c === '주의' ? 'text-[#cc7000]' : ''} ${j === 0 || j === 3 || j === 4 || j === 5 ? 'text-center' : ''}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mb-1"><b>3. 주요 리스크 및 대응</b></p>
          <ul className="list-disc pl-8 mb-4">
            <li className="mb-1">글로벌 e-Commerce 오픈 — 결제 게이트웨이 인증 절차 지연. 6월 1주 내 PG 사 재협의 예정.</li>
            <li className="mb-1">CRM 마이그레이션 — 데이터 정합성 검증에서 0.7% 불일치 발견. 추가 정제 작업 진행 중.</li>
            <li className="mb-1">브랜드 리뉴얼 — 외부 디자인 에이전시 일정 변경. PMO 차원에서 재조정 협의.</li>
          </ul>

          <p className="mb-1"><b>4. 차주 액션 아이템</b></p>
          <ol className="list-decimal pl-8 mb-4">
            <li className="mb-1">PG 사 미팅 (5/13 오전 10시, 본사 대회의실) — 결제팀 / 법무 / 보안 합석.</li>
            <li className="mb-1">CRM 데이터 정합성 보고서 초안 (5/15) — 데이터팀 송 책임.</li>
            <li className="mb-1">글로벌 오픈 일정 재산정 (5/16, 임원보고) — 해외사업 김 팀장 주관.</li>
            <li className="mb-1">분기 KPI 중간 점검 워크숍 (5/20, 13:00–17:00) — 전사.</li>
          </ol>

          <p className="mb-1"><b>5. 첨부</b></p>
          <ul className="list-disc pl-8 mb-8">
            <li>붙임1. Q2 프로젝트별 마일스톤 — 1부.</li>
            <li>붙임2. 리스크 관리 체크리스트 — 1부.</li>
            <li>붙임3. 차주 일정표 — 1부.</li>
          </ul>

          <div className="text-center mt-12">— 끝 —</div>
        </div>
      </div>
      {/* 상태바 */}
      <div className="flex items-center justify-between bg-[#f3f3f3] border-t border-[#c4c4c4] text-[11px] h-[20px] px-3 text-[#333]">
        <div>1쪽 / 1쪽 · 단 1 · 줄 18 · 칸 32</div>
        <div className="flex gap-3">
          <span>입력</span>
          <span>한자</span>
          <span>변경: 14:38</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}

// ─── WORD ───────────────────────────────────────────────
function WordDisguise({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10000] bg-[#f3f2f1] flex flex-col select-none" style={{ fontFamily: '"Calibri", "Malgun Gothic", sans-serif' }}>
      <PanicCorner onClose={onClose} />
      {/* 타이틀바 */}
      <div className="flex items-center justify-between bg-[#2b579a] text-white text-[12px] h-[28px] px-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px]">📄</span>
          <span className="font-bold">Q2_Performance_Review_Final_v4.docx · Word</span>
        </div>
        <div className="flex items-center gap-3">
          <span>김민지 (Microsoft 365)</span>
          <span className="opacity-70">— □ ✕</span>
        </div>
      </div>
      {/* 메뉴 */}
      <div className="flex items-center bg-white text-[12px] border-b border-[#e0e0e0] h-[24px] px-2 gap-3 text-[#444]">
        {['파일', '홈', '삽입', '그리기', '디자인', '레이아웃', '참조', '편지', '검토', '보기', '도움말'].map((m, i) => (
          <span key={i} className={i === 1 ? 'border-b-2 border-[#2b579a] font-bold text-[#2b579a] pb-px' : 'hover:bg-[#f3f3f3] px-1 py-px'}>{m}</span>
        ))}
      </div>
      {/* 리본 */}
      <div className="bg-white border-b border-[#e0e0e0] h-[88px] px-3 py-2 flex items-stretch gap-4 text-[10px]">
        <RibbonGroup label="클립보드">
          <RibbonBtn icon="📋" label="붙여넣기" big />
        </RibbonGroup>
        <RibbonGroup label="글꼴">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <select className="border border-[#d4d4d4] text-[11px] px-1 py-0.5 bg-white w-[110px]"><option>맑은 고딕</option></select>
              <select className="border border-[#d4d4d4] text-[11px] px-1 py-0.5 bg-white w-[44px]"><option>11</option></select>
            </div>
            <div className="flex items-center gap-0.5">
              {['B', 'I', 'U', 'abc', 'x²', 'x₂', 'A', 'A̲'].map((s, i) => <span key={i} className="w-5 h-5 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[11px] cursor-default">{s}</span>)}
            </div>
          </div>
        </RibbonGroup>
        <RibbonGroup label="단락">
          <div className="flex items-center gap-0.5">
            {['•', '1.', '⊟', '←', '→', '≡'].map((s, i) => <span key={i} className="w-5 h-5 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[11px] cursor-default">{s}</span>)}
          </div>
        </RibbonGroup>
        <RibbonGroup label="스타일">
          <div className="flex items-center gap-0.5">
            <span className="px-2 py-3 border border-[#d4d4d4] bg-white text-[10px]">표준</span>
            <span className="px-2 py-3 border border-[#d4d4d4] bg-white text-[10px]">제목 1</span>
            <span className="px-2 py-3 border border-[#d4d4d4] bg-white text-[10px]">제목 2</span>
            <span className="px-2 py-3 border border-[#d4d4d4] bg-white text-[10px]">강조</span>
          </div>
        </RibbonGroup>
        <RibbonGroup label="편집">
          <div className="flex items-center gap-0.5">
            {['찾기', '바꾸기', '선택'].map((s, i) => <span key={i} className="px-2 py-3 border border-transparent hover:border-[#d4d4d4] text-[10px] cursor-default">{s}</span>)}
          </div>
        </RibbonGroup>
      </div>
      {/* 본문 */}
      <div className="flex-1 overflow-auto bg-[#f3f2f1] py-8">
        <div className="mx-auto bg-white shadow-md text-[13px] text-[#222]" style={{ width: '816px', minHeight: '1056px', padding: '72px 80px', lineHeight: 1.8 }}>
          <h1 className="text-[28px] font-bold text-[#2b579a] mb-1">Q2 Performance Review</h1>
          <div className="text-[12px] text-[#666] mb-2">2026 Quarterly Business Update · Strategy & Planning Division</div>
          <div className="border-b-2 border-[#2b579a] mb-6"></div>

          <h2 className="text-[18px] font-bold text-[#2b579a] mt-4 mb-2">Executive Summary</h2>
          <p className="mb-3">In Q2 2026, our division delivered <b>97.4% of the assigned revenue target</b>, driven primarily by stronger-than-expected B2B contract renewals and a successful product line expansion. Quarter-over-quarter growth reached <b>+12%</b>, with notable contributions from the strategic accounts team.</p>
          <p className="mb-3">However, three key projects experienced timeline slippage due to external dependencies. A consolidated mitigation plan is outlined in section 4.</p>

          <h2 className="text-[18px] font-bold text-[#2b579a] mt-6 mb-2">Key Highlights</h2>
          <ul className="list-disc pl-6 mb-4">
            <li className="mb-1">Total Q2 revenue: <b>₩782.2M</b> (vs. plan ₩803M, achievement 97.4%)</li>
            <li className="mb-1">YoY growth: <b>+12.3%</b>; QoQ growth: <b>+10.7%</b></li>
            <li className="mb-1">New customer acquisition: <b>184 accounts</b> (+38% YoY)</li>
            <li className="mb-1">NPS improved from <b>54 → 66</b> (+12 pts)</li>
            <li className="mb-1">Two strategic M&A targets entered final due-diligence</li>
          </ul>

          <h2 className="text-[18px] font-bold text-[#2b579a] mt-6 mb-2">Project Status</h2>
          <table className="w-full text-[12px] border border-[#999] border-collapse mb-4">
            <thead>
              <tr className="bg-[#dde6f3]">
                <th className="border border-[#999] py-1.5 px-2 text-left">Project</th>
                <th className="border border-[#999] py-1.5 px-2">Owner</th>
                <th className="border border-[#999] py-1.5 px-2">Progress</th>
                <th className="border border-[#999] py-1.5 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Next-Gen Payment Gateway', 'Payments', '78%', 'On Track'],
                ['CRM Migration', 'IT Strategy', '64%', 'Caution'],
                ['Global e-Commerce Launch', 'Intl. Biz', '52%', 'Delayed'],
                ['ERP Module Upgrade', 'IT Ops', '91%', 'On Track'],
                ['Customer Data Platform', 'Data', '45%', 'On Track'],
              ].map((r, i) => (
                <tr key={i}>
                  <td className="border border-[#999] py-1.5 px-2">{r[0]}</td>
                  <td className="border border-[#999] py-1.5 px-2 text-center">{r[1]}</td>
                  <td className="border border-[#999] py-1.5 px-2 text-center">{r[2]}</td>
                  <td className={`border border-[#999] py-1.5 px-2 text-center ${r[3] === 'Delayed' ? 'text-[#c00]' : r[3] === 'Caution' ? 'text-[#cc7000]' : 'text-[#0a8a3f]'}`}>{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="text-[18px] font-bold text-[#2b579a] mt-6 mb-2">Risks & Mitigation</h2>
          <ol className="list-decimal pl-6 mb-4">
            <li className="mb-2"><b>Global e-Commerce Launch</b> — Payment gateway certification delayed. Renegotiation with PG vendor scheduled for week of June 1.</li>
            <li className="mb-2"><b>CRM Migration</b> — 0.7% data integrity gap identified during validation. Additional cleansing in progress; expected resolution by 5/22.</li>
            <li className="mb-2"><b>Brand Refresh — Phase 2</b> — External agency timeline shifted; PMO leading rescheduling.</li>
          </ol>

          <h2 className="text-[18px] font-bold text-[#2b579a] mt-6 mb-2">Action Items</h2>
          <ul className="list-disc pl-6">
            <li className="mb-1">PG vendor meeting (5/13, 10:00) — Payments / Legal / Security</li>
            <li className="mb-1">CRM integrity report draft (5/15) — Data Lead</li>
            <li className="mb-1">Global launch re-baseline (5/16, exec review) — Intl. Biz Head</li>
            <li className="mb-1">Quarterly KPI mid-checkpoint (5/20, 13:00–17:00) — All hands</li>
          </ul>
        </div>
      </div>
      {/* 상태바 */}
      <div className="flex items-center justify-between bg-[#2b579a] text-white text-[11px] h-[22px] px-3">
        <div className="flex items-center gap-3">
          <span>1/4 페이지</span>
          <span>·</span>
          <span>단어 638개</span>
          <span>·</span>
          <span>한국어</span>
        </div>
        <div className="flex items-center gap-3">
          <span>변경 내용 추적: 사용 안 함</span>
          <span>·</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
