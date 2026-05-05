// 홈 라우트 (`/`) 전용 로딩 스켈레톤.
// fetchFeed 캐시 미스 또는 콜드 요청에서 빈 화면 대신 즉시 노출.
// 모바일은 피드 카드 placeholder, 데스크톱은 지도 placeholder 한 장.
export default function HomeLoading() {
  return (
    <div className="flex min-h-screen">
      {/* 사이드바 placeholder — lg 이상에서만 자리 차지 */}
      <div className="hidden lg:block w-[260px] flex-shrink-0 bg-white border-r border-border" />
      <main className="flex-1 min-w-0 flex flex-col">
        {/* 모바일: 피드 헤더 + 카드 스켈레톤 */}
        <div className="lg:hidden bg-white">
          <div className="sticky top-0 z-10 bg-white border-b border-border h-[52px] flex items-center justify-center gap-2">
            <div className="w-7 h-7 rounded bg-[#eef0f3] animate-pulse" />
            <div className="w-20 h-4 rounded bg-[#eef0f3] animate-pulse" />
          </div>
          <ul>
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="h-3 w-24 bg-[#eef0f3] rounded animate-pulse" />
                  <div className="h-3 w-16 bg-[#eef0f3] rounded animate-pulse" />
                </div>
                <div className="h-3 w-full bg-[#eef0f3] rounded animate-pulse mb-1.5" />
                <div className="h-3 w-3/4 bg-[#eef0f3] rounded animate-pulse" />
              </li>
            ))}
          </ul>
        </div>
        {/* 데스크톱: 지도 placeholder */}
        <div className="hidden lg:flex flex-1 bg-[#f5f7fa] items-center justify-center">
          <div className="text-muted text-sm">지도 불러오는 중...</div>
        </div>
      </main>
    </div>
  );
}
