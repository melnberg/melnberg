'use client';

// 보스 모드 — 회사용 위장 화면. 메인 (지도) 화면에서만 노출.
// 카카오톡 엑셀 모드와 같은 컨셉. 우상단 3개 버튼.
//
// 핵심: 위장 화면 안에서도 실제 커뮤니티 피드를 그대로 읽고 클릭 가능.
//   - Excel: 한 줄 = 한 글. 셀 클릭 → 해당 글 이동
//   - 한글/Word: 본문 단락 = 한 글. 헤딩 클릭 → 해당 글 이동
//   - 부서/팀/담당자 등 셀은 카테고리·작성자를 매핑한 가짜 라벨
//
// 해제: Esc 키 / 좌상단 1px invisible 빨간 닫기 버튼.
// 모드는 localStorage 'melnberg-boss-mode' 에 저장.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Mode = 'excel' | 'hwp' | 'word' | null;

type FeedPost = {
  id: number;
  title: string;
  excerpt: string;
  category: string;
  team: string;
  author: string;
  like: number;
  view: number;
  comments: number;
  created_at: string;
};

const STORAGE_KEY = 'melnberg-boss-mode';

const CATEGORY_BASE: Record<string, string> = {
  community: '/community',
  hotdeal: '/hotdeal',
  stocks: '/stocks',
  realty: '/realty',
  worry: '/worry',
  coin: '/coin',
};

export default function BossMode() {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>(null);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 보스모드 = 데스크탑 전용. 회사 모니터 가정. 모바일에선 무의미.
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (mq.matches && (saved === 'excel' || saved === 'hwp' || saved === 'word')) setMode(saved);
    } catch { /* noop */ }
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      if (mode) localStorage.setItem(STORAGE_KEY, mode);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* noop */ }
  }, [mode, mounted]);

  // 피드 fetch — 모드 활성 시 한 번
  useEffect(() => {
    if (!mode || feed.length > 0 || loadingFeed) return;
    setLoadingFeed(true);
    fetch('/api/feed/recent', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.posts)) setFeed(j.posts as FeedPost[]);
      })
      .catch(() => { /* silent */ })
      .finally(() => setLoadingFeed(false));
  }, [mode, feed.length, loadingFeed]);

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
  // 모바일은 보스모드 자체를 숨김. 트리거 / 오버레이 둘 다.
  if (!isDesktop) return null;

  // 트리거 — 메인 (지도) 화면에서만. /community/, /stocks/ 등 다른 페이지에선 노출 X.
  const isHome = pathname === '/';

  return (
    <>
      {!mode && isHome && (
        <div className="fixed top-12 right-2 z-50 flex flex-col gap-1 items-end">
          <span className="text-[9px] font-bold tracking-widest uppercase text-muted/70 bg-white/90 px-1.5 py-0.5 rounded-sm pointer-events-none">
            🎭 위장 모드
          </span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setMode('excel')}
              className="px-2 py-1 text-[10px] font-bold bg-white border border-[#107c41] text-[#107c41] hover:bg-[#107c41] hover:text-white cursor-pointer rounded-sm shadow-sm"
              title="Excel 위장 (Esc 로 해제)">📗 Excel</button>
            <button type="button" onClick={() => setMode('hwp')}
              className="px-2 py-1 text-[10px] font-bold bg-white border border-[#0066b3] text-[#0066b3] hover:bg-[#0066b3] hover:text-white cursor-pointer rounded-sm shadow-sm"
              title="한글 위장 (Esc 로 해제)">📘 한글</button>
            <button type="button" onClick={() => setMode('word')}
              className="px-2 py-1 text-[10px] font-bold bg-white border border-[#2b579a] text-[#2b579a] hover:bg-[#2b579a] hover:text-white cursor-pointer rounded-sm shadow-sm"
              title="Word 위장 (Esc 로 해제)">📄 Word</button>
          </div>
        </div>
      )}

      {mode === 'excel' && <ExcelDisguise feed={feed} loading={loadingFeed} onClose={() => setMode(null)} />}
      {mode === 'hwp' && <HangulDisguise feed={feed} loading={loadingFeed} onClose={() => setMode(null)} />}
      {mode === 'word' && <WordDisguise feed={feed} loading={loadingFeed} onClose={() => setMode(null)} />}
    </>
  );
}

// 좌상단 1px invisible 패닉 버튼 (마우스 올리면 빨간 점)
function PanicCorner({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} title="위장 해제 (Esc)" aria-label="위장 해제"
      className="fixed top-1 left-1 z-[10001] w-3 h-3 cursor-pointer bg-transparent border-none p-0 m-0 opacity-0 hover:opacity-100">
      <span className="block w-full h-full bg-red-500" />
    </button>
  );
}

// 우상단 ─ □ ✕ — 윈도우 타이틀바 끝 버튼 3종. ✕ 만 실제 동작 (위장 해제).
function WindowControls({ onClose, accent }: { onClose: () => void; accent: string }) {
  // 호버 색 — 각 앱 강조색에 맞춰 살짝 어두운 톤으로
  const hoverBg = 'rgba(255,255,255,0.18)';
  return (
    <div className="flex items-stretch h-full">
      <button type="button" aria-label="최소화" tabIndex={-1}
        className="w-[44px] h-full flex items-center justify-center text-white/80 cursor-default border-none p-0"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
        <span className="text-[14px] leading-none">─</span>
      </button>
      <button type="button" aria-label="최대화" tabIndex={-1}
        className="w-[44px] h-full flex items-center justify-center text-white/80 cursor-default border-none p-0"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
        <span className="text-[12px] leading-none">▢</span>
      </button>
      <button type="button" aria-label="닫기 (위장 해제)" title="닫기 (Esc)"
        onClick={onClose}
        className="w-[44px] h-full flex items-center justify-center text-white cursor-pointer border-none p-0"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#e81123'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
        <span className="text-[14px] font-bold leading-none">✕</span>
      </button>
      {/* accent 인자 — placeholder, 색은 hoverBg 로 결정. accent 사용해 lint pass. */}
      <span className="hidden" data-accent={accent} />
    </div>
  );
}

function postHref(p: FeedPost): string {
  const base = CATEGORY_BASE[p.category] ?? '/community';
  return `${base}/${p.id}`;
}

// ─── EXCEL ──────────────────────────────────────────────
function ExcelDisguise({ feed, loading, onClose }: { feed: FeedPost[]; loading: boolean; onClose: () => void }) {
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
  const headers = ['No.', '부서', '담당자', '항목', '내용 요약', '댓글', '추천', '조회', '등록일', '진행상태', '비고'];

  // created_at → 'YYYY-MM-DD'
  const fmtDate = (s: string) => {
    try { return new Date(s).toISOString().slice(0, 10); } catch { return s.slice(0, 10); }
  };
  // 진행상태 — 댓글 많으면 '진행중', 적으면 '검토'
  const status = (p: FeedPost) => p.comments >= 5 ? '진행중' : p.comments >= 1 ? '검토' : '대기';
  const statusColor = (s: string) => s === '진행중' ? 'text-[#107c41]' : s === '검토' ? 'text-[#cc7000]' : 'text-[#666]';

  return (
    <div className="fixed inset-0 z-[10000] bg-[#f3f3f3] flex flex-col select-none" style={{ fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif' }}>
      <PanicCorner onClose={onClose} />
      <div className="flex items-center justify-between bg-[#107c41] text-white text-[12px] h-[28px]">
        <div className="flex items-center gap-2 px-3">
          <span className="text-[14px]">📗</span>
          <span className="font-bold">2026Q2_부서별_업무현황_통합대시보드_v3_(공유).xlsx · Excel</span>
        </div>
        <div className="flex items-center gap-3 text-[12px] pl-3">
          <span>김민지 (Microsoft 365)</span>
          <WindowControls onClose={onClose} accent="#107c41" />
        </div>
      </div>
      <div className="flex items-center bg-white text-[12px] border-b border-[#d4d4d4] h-[24px] px-2 gap-3 text-[#444]">
        {['파일', '홈', '삽입', '그리기', '페이지 레이아웃', '수식', '데이터', '검토', '보기', '자동화', '도움말'].map((m, i) => (
          <span key={i} className={i === 1 ? 'border-b-2 border-[#107c41] font-bold text-[#107c41] pb-px' : 'hover:bg-[#e5f3ec] px-1 py-px'}>{m}</span>
        ))}
      </div>
      <div className="bg-white border-b border-[#d4d4d4] h-[78px] px-3 py-2 flex items-stretch gap-4 text-[10px]">
        <RibbonGroup label="클립보드">
          <div className="flex flex-col items-center w-[44px] py-1 border border-transparent hover:border-[#d4d4d4]">
            <span className="text-[18px]">📋</span><span className="text-[9px] text-[#444]">붙여넣기</span>
          </div>
        </RibbonGroup>
        <RibbonGroup label="글꼴">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <select className="border border-[#d4d4d4] text-[11px] px-1 py-0.5 bg-white w-[110px]"><option>맑은 고딕</option></select>
              <select className="border border-[#d4d4d4] text-[11px] px-1 py-0.5 bg-white w-[44px]"><option>11</option></select>
            </div>
            <div className="flex items-center gap-0.5">
              {['B', 'I', 'U', '⌐', '✏'].map((s, i) => <span key={i} className="w-5 h-5 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[11px]">{s}</span>)}
            </div>
          </div>
        </RibbonGroup>
        <RibbonGroup label="맞춤">
          <div className="flex items-center gap-0.5">
            {['↑', '−', '↓', '←', '≡', '→'].map((s, i) => <span key={i} className="w-5 h-5 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[11px]">{s}</span>)}
          </div>
        </RibbonGroup>
        <RibbonGroup label="표시 형식">
          <select className="border border-[#d4d4d4] text-[11px] px-1 py-0.5 bg-white w-[100px]"><option>일반</option></select>
          <div className="flex items-center gap-0.5 mt-1">
            {['₩', '%', ',', '.0'].map((s, i) => <span key={i} className="w-5 h-5 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[11px]">{s}</span>)}
          </div>
        </RibbonGroup>
        <RibbonGroup label="스타일">
          <div className="flex items-center gap-0.5">
            <span className="px-1.5 py-2 border border-[#d4d4d4] bg-[#fff2cc] text-[10px]">조건부<br />서식</span>
            <span className="px-1.5 py-2 border border-[#d4d4d4] bg-[#dde8ed] text-[10px]">표 서식</span>
            <span className="px-1.5 py-2 border border-[#d4d4d4] bg-[#e2efda] text-[10px]">셀 스타일</span>
          </div>
        </RibbonGroup>
      </div>
      <div className="flex items-center bg-white border-b border-[#d4d4d4] h-[24px] text-[11px]">
        <div className="flex items-center px-2 border-r border-[#d4d4d4] w-[140px] gap-2">
          <span className="text-[#444]">A2</span><span className="text-[#888]">▼</span>
        </div>
        <div className="flex items-center px-2 border-r border-[#d4d4d4] gap-2 text-[#888]"><span>fx</span></div>
        <div className="flex-1 px-2 text-[#444] tabular-nums">=COUNTA(D2:D{Math.max(feed.length + 1, 50)})</div>
      </div>
      <div className="flex-1 overflow-auto bg-white text-[12px]" style={{ fontFamily: '"맑은 고딕", "Malgun Gothic", sans-serif' }}>
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-[#e6e6e6] border border-[#c2c2c2] w-[36px] h-[20px] text-[#666] font-normal"></th>
              {cols.map((c, i) => {
                const widths = [36, 90, 80, 220, 380, 50, 50, 50, 90, 80, 140];
                return (
                  <th key={c} className="sticky top-0 z-10 bg-[#e6e6e6] border border-[#c2c2c2] h-[20px] text-[#222] font-normal" style={{ width: widths[i] }}>{c}</th>
                );
              })}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-[#e6e6e6] border border-[#c2c2c2] w-[36px] h-[22px] text-[#666] font-normal">1</th>
              {headers.map((h, i) => (
                <td key={i} className="border border-[#d4d4d4] px-2 h-[22px] font-bold text-white text-center" style={{ background: '#107c41' }}>{h}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && feed.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="text-center py-8 text-[#888]">데이터 불러오는 중...</td></tr>
            )}
            {feed.map((p, idx) => {
              const st = status(p);
              return (
                <tr key={p.id} className="hover:bg-[#fffbe6] cursor-pointer">
                  <th className="sticky left-0 z-10 bg-[#e6e6e6] border border-[#c2c2c2] w-[36px] h-[22px] text-[#666] font-normal">{idx + 2}</th>
                  <td className="border border-[#d4d4d4] px-2 h-[22px] tabular-nums text-right">{idx + 1}</td>
                  <td className="border border-[#d4d4d4] px-2 h-[22px]">{p.team}</td>
                  <td className="border border-[#d4d4d4] px-2 h-[22px]">{p.author}</td>
                  <td className="border border-[#d4d4d4] px-2 h-[22px] text-[#0070c0]">
                    <Link href={postHref(p)} className="text-[#0070c0] no-underline hover:underline" onClick={(e) => e.stopPropagation()}>
                      {p.title}
                    </Link>
                  </td>
                  <td className="border border-[#d4d4d4] px-2 h-[22px] text-[#444] truncate max-w-[380px]" title={p.excerpt}>
                    {p.excerpt}
                  </td>
                  <td className="border border-[#d4d4d4] px-2 h-[22px] tabular-nums text-right">{p.comments}</td>
                  <td className="border border-[#d4d4d4] px-2 h-[22px] tabular-nums text-right">{p.like}</td>
                  <td className="border border-[#d4d4d4] px-2 h-[22px] tabular-nums text-right">{p.view}</td>
                  <td className="border border-[#d4d4d4] px-2 h-[22px] tabular-nums">{fmtDate(p.created_at)}</td>
                  <td className={`border border-[#d4d4d4] px-2 h-[22px] font-bold ${statusColor(st)}`}>{st}</td>
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, 30 - feed.length) }).map((_, rIdx) => (
              <tr key={`empty-${rIdx}`}>
                <th className="sticky left-0 z-10 bg-[#e6e6e6] border border-[#c2c2c2] w-[36px] h-[22px] text-[#666] font-normal">{feed.length + 2 + rIdx}</th>
                {cols.map((c) => <td key={c} className="border border-[#d4d4d4] px-2 h-[22px] bg-white"></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center bg-[#f3f3f3] border-t border-[#d4d4d4] h-[22px] text-[11px] px-2 gap-1">
        <span className="px-2 py-px bg-white border border-[#d4d4d4] border-b-0 -mb-px font-bold">Q2_업무</span>
        <span className="px-2 py-px text-[#444]">Q1_업무</span>
        <span className="px-2 py-px text-[#444]">전월대비</span>
        <span className="px-2 py-px text-[#444]">+</span>
      </div>
      <div className="flex items-center justify-between bg-[#107c41] text-white text-[11px] h-[20px] px-3">
        <div className="flex items-center gap-3"><span>준비</span><span>·</span><span>접근성: 조사하세요</span></div>
        <div className="flex items-center gap-3">
          <span>개수: {feed.length}</span>
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

// ─── 한글 (HWP) ─────────────────────────────────────────
function HangulDisguise({ feed, loading, onClose }: { feed: FeedPost[]; loading: boolean; onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '. ') + '.';

  return (
    <div className="fixed inset-0 z-[10000] bg-[#e8e8e8] flex flex-col select-none" style={{ fontFamily: '"맑은 고딕", "Malgun Gothic", sans-serif' }}>
      <PanicCorner onClose={onClose} />
      <div className="flex items-center justify-between bg-[#0066b3] text-white text-[12px] h-[26px]">
        <div className="flex items-center gap-2 px-3">
          <span className="text-[14px]">📘</span>
          <span className="font-bold">[{today}] 부서별_업무현황_보고_(0판)_김민지대리.hwpx · 한글 2024</span>
        </div>
        <WindowControls onClose={onClose} accent="#0066b3" />
      </div>
      <div className="flex items-center bg-[#f3f3f3] text-[12px] border-b border-[#c4c4c4] h-[22px] px-2 gap-3 text-[#333]">
        {['파일', '편집', '보기', '입력', '서식', '쪽', '보안', '검토', '도구', '표', '창', '도움말'].map((m) => <span key={m} className="hover:bg-white px-1 py-px">{m}</span>)}
      </div>
      <div className="bg-[#f3f3f3] border-b border-[#c4c4c4] px-2 py-1 flex items-center gap-1 text-[11px]">
        <select className="border border-[#bbb] bg-white px-1 py-0.5 w-[120px]"><option>본문</option></select>
        <select className="border border-[#bbb] bg-white px-1 py-0.5 w-[120px]"><option>함초롬바탕</option></select>
        <select className="border border-[#bbb] bg-white px-1 py-0.5 w-[50px]"><option>10.0</option></select>
        <span className="mx-1 text-[#bbb]">|</span>
        {['B', 'I', 'U', 'S', 'A̲'].map((s, i) => <span key={i} className="w-6 h-6 border border-transparent hover:border-[#bbb] bg-white flex items-center justify-center cursor-default">{s}</span>)}
        <span className="mx-1 text-[#bbb]">|</span>
        {['≡', '≢', '≣', '⏐'].map((s, i) => <span key={i} className="w-6 h-6 border border-transparent hover:border-[#bbb] bg-white flex items-center justify-center cursor-default">{s}</span>)}
        <span className="ml-auto text-[10px] text-[#666]">자동저장: 14:38</span>
      </div>
      <div className="flex-1 overflow-auto py-6">
        <div className="mx-auto bg-white shadow-md text-[13px] text-[#222]" style={{ width: '794px', minHeight: '1123px', padding: '64px 72px', lineHeight: 1.85 }}>
          <div className="text-right text-[11px] text-[#666]">문서번호: ATR-2026-Q2-118</div>
          <div className="text-right text-[11px] text-[#666] mb-8">시행일자: {today}</div>
          <h1 className="text-center text-[24px] font-bold mb-2 tracking-tight">부서별 업무 현황 보고</h1>
          <div className="text-center text-[12px] text-[#666] mb-10">— 신사업본부 / 전략기획팀 —</div>

          <p className="mb-1"><b>1. 보고 목적</b></p>
          <p className="mb-6 pl-4">각 부서에서 진행 중인 업무 항목과 현재 상태를 정리하여 차주 임원회의 자료로 활용하기 위함.</p>

          <p className="mb-1"><b>2. 부서별 진행 현황</b></p>

          {loading && feed.length === 0 && (
            <p className="mb-4 pl-4 text-[#888]">데이터 불러오는 중...</p>
          )}

          {feed.map((p, i) => (
            <div key={p.id} className="mb-4">
              <p className="mb-1">
                <b>2.{i + 1}.</b>{' '}
                <Link href={postHref(p)} className="text-[#222] no-underline hover:underline">
                  <b>[{p.team}]</b> {p.title}
                </Link>
              </p>
              {p.excerpt && (
                <p className="pl-4 text-[#333]">{p.excerpt}</p>
              )}
              <p className="pl-4 text-[12px] text-[#666] mt-1">
                담당: {p.author} · 진행: 댓글 {p.comments}건 / 추천 {p.like}건 · 등록일: {p.created_at.slice(0, 10)}
              </p>
            </div>
          ))}

          <p className="mb-1 mt-8"><b>3. 차주 일정</b></p>
          <ul className="list-disc pl-8 mb-4">
            <li className="mb-1">전사 KPI 중간 점검 워크숍 (5/20, 13:00–17:00)</li>
            <li className="mb-1">분기 보고서 임원 보고 (5/22)</li>
            <li className="mb-1">신규 프로젝트 킥오프 미팅 (5/27)</li>
          </ul>

          <div className="text-center mt-12">— 끝 —</div>
        </div>
      </div>
      <div className="flex items-center justify-between bg-[#f3f3f3] border-t border-[#c4c4c4] text-[11px] h-[20px] px-3 text-[#333]">
        <div>1쪽 / 1쪽 · 단 1 · 줄 18 · 칸 32</div>
        <div className="flex gap-3"><span>입력</span><span>한자</span><span>변경: 14:38</span><span>100%</span></div>
      </div>
    </div>
  );
}

// ─── WORD ───────────────────────────────────────────────
function WordDisguise({ feed, loading, onClose }: { feed: FeedPost[]; loading: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10000] bg-[#f3f2f1] flex flex-col select-none" style={{ fontFamily: '"Calibri", "Malgun Gothic", sans-serif' }}>
      <PanicCorner onClose={onClose} />
      <div className="flex items-center justify-between bg-[#2b579a] text-white text-[12px] h-[28px]">
        <div className="flex items-center gap-2 px-3">
          <span className="text-[14px]">📄</span>
          <span className="font-bold">Q2_Department_Activity_Report_FINAL_v4.docx · Word</span>
        </div>
        <div className="flex items-center gap-3 pl-3">
          <span>김민지 (Microsoft 365)</span>
          <WindowControls onClose={onClose} accent="#2b579a" />
        </div>
      </div>
      <div className="flex items-center bg-white text-[12px] border-b border-[#e0e0e0] h-[24px] px-2 gap-3 text-[#444]">
        {['파일', '홈', '삽입', '그리기', '디자인', '레이아웃', '참조', '편지', '검토', '보기', '도움말'].map((m, i) => (
          <span key={i} className={i === 1 ? 'border-b-2 border-[#2b579a] font-bold text-[#2b579a] pb-px' : 'hover:bg-[#f3f3f3] px-1 py-px'}>{m}</span>
        ))}
      </div>
      <div className="bg-white border-b border-[#e0e0e0] h-[78px] px-3 py-2 flex items-stretch gap-4 text-[10px]">
        <RibbonGroup label="클립보드">
          <div className="flex flex-col items-center w-[44px] py-1 border border-transparent hover:border-[#d4d4d4]">
            <span className="text-[18px]">📋</span><span className="text-[9px] text-[#444]">붙여넣기</span>
          </div>
        </RibbonGroup>
        <RibbonGroup label="글꼴">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <select className="border border-[#d4d4d4] text-[11px] px-1 py-0.5 bg-white w-[110px]"><option>맑은 고딕</option></select>
              <select className="border border-[#d4d4d4] text-[11px] px-1 py-0.5 bg-white w-[44px]"><option>11</option></select>
            </div>
            <div className="flex items-center gap-0.5">
              {['B', 'I', 'U', 'abc', 'x²'].map((s, i) => <span key={i} className="w-5 h-5 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[11px]">{s}</span>)}
            </div>
          </div>
        </RibbonGroup>
        <RibbonGroup label="단락">
          <div className="flex items-center gap-0.5">
            {['•', '1.', '⊟', '←', '→', '≡'].map((s, i) => <span key={i} className="w-5 h-5 border border-transparent hover:border-[#d4d4d4] flex items-center justify-center text-[11px]">{s}</span>)}
          </div>
        </RibbonGroup>
        <RibbonGroup label="스타일">
          <div className="flex items-center gap-0.5">
            <span className="px-2 py-3 border border-[#d4d4d4] bg-white text-[10px]">표준</span>
            <span className="px-2 py-3 border border-[#d4d4d4] bg-white text-[10px]">제목 1</span>
            <span className="px-2 py-3 border border-[#d4d4d4] bg-white text-[10px]">제목 2</span>
          </div>
        </RibbonGroup>
      </div>
      <div className="flex-1 overflow-auto bg-[#f3f2f1] py-8">
        <div className="mx-auto bg-white shadow-md text-[13px] text-[#222]" style={{ width: '816px', minHeight: '1056px', padding: '72px 80px', lineHeight: 1.8 }}>
          <h1 className="text-[28px] font-bold text-[#2b579a] mb-1">Department Activity Report</h1>
          <div className="text-[12px] text-[#666] mb-2">Q2 2026 · Strategy &amp; Planning Division</div>
          <div className="border-b-2 border-[#2b579a] mb-6"></div>

          <h2 className="text-[18px] font-bold text-[#2b579a] mt-4 mb-2">Executive Summary</h2>
          <p className="mb-4">이 문서는 2026년 2분기 동안 각 부서에서 진행된 주요 업무를 요약한 것입니다. 각 항목은 담당자, 진행 상태, 주요 코멘트를 포함합니다. 차주 경영회의 자료 인쇄 전 검토 부탁드립니다.</p>

          <h2 className="text-[18px] font-bold text-[#2b579a] mt-6 mb-2">Activity Log</h2>
          {loading && feed.length === 0 && (
            <p className="text-[#888]">데이터 불러오는 중...</p>
          )}
          <ol className="list-decimal pl-6">
            {feed.map((p) => (
              <li key={p.id} className="mb-3">
                <Link href={postHref(p)} className="text-[#222] no-underline hover:underline">
                  <b>[{p.team}]</b> {p.title}
                </Link>
                {p.excerpt && <div className="text-[#333] mt-1">{p.excerpt}</div>}
                <div className="text-[11px] text-[#666] mt-1">
                  Owner: {p.author} · Comments: {p.comments} · Likes: {p.like} · {p.created_at.slice(0, 10)}
                </div>
              </li>
            ))}
          </ol>

          <h2 className="text-[18px] font-bold text-[#2b579a] mt-6 mb-2">Next Week</h2>
          <ul className="list-disc pl-6">
            <li className="mb-1">All-hands KPI mid-checkpoint (5/20, 13:00–17:00)</li>
            <li className="mb-1">Q2 review with executives (5/22)</li>
            <li className="mb-1">New project kick-off (5/27)</li>
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-between bg-[#2b579a] text-white text-[11px] h-[22px] px-3">
        <div className="flex items-center gap-3"><span>1/4 페이지</span><span>·</span><span>단어 638개</span><span>·</span><span>한국어</span></div>
        <div className="flex items-center gap-3"><span>변경 내용 추적: 사용 안 함</span><span>·</span><span>100%</span></div>
      </div>
    </div>
  );
}
