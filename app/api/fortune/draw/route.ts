// 포춘쿠키 — 오늘의 운세 뽑기. 1일 1회 (KST 기준) 한정.
// POST /api/fortune/draw — 사용자 인증 필수. 오늘치 있으면 그거 반환, 없으면 새로 뽑음.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 50개 운세 — 재미있고 구체적. 자산·관계·사소한 일상 사건 mix.
const FORTUNES: string[] = [
  '오늘 점심에 평소 안 가던 식당이 인생 식당으로 등극함. 메뉴는 직원 추천 따라가야 함.',
  '오후 3시쯤 친한 사람한테 의외의 메시지 옴. 답장은 5분 안에 해야 운 살아남.',
  '오늘 갑자기 입은 옷이 다른 사람한테 칭찬받음. 새 옷 같다는 말 들으면 진짜 잘 풀리는 날.',
  '저녁 약속 잡으면 무조건 나가는 게 이득. 돈은 결국 그 자리에서 회수됨.',
  '엘리베이터에서 우연히 만난 사람과의 대화에서 좋은 정보 하나 줍는 날.',
  '오늘 충동적으로 누른 좋아요 하나가 인연이 됨. 댓글까지 달면 일 커짐.',
  '점심 후 산책 5분이 오늘의 가장 큰 리턴이 됨. 무조건 나가야 함.',
  '오늘 마신 커피 한 잔이 대박 행운의 트리거. 카페 영수증 버리지 말 것.',
  '뭔가 사고 싶어지면 일단 24시간 미루기. 내일 보면 90% 안 사도 됨.',
  '미루던 카톡 답장 하나만 보내도 그날 흐름 통째로 풀림. 가장 오래된 미답장부터.',
  '오늘 저녁 메뉴 결정에서 양보하면 다음 주 큰 결정에서 주도권 옴.',
  '오후에 깜빡한 거 떠오르면 지금 당장 처리. 미루면 일주일 내내 따라옴.',
  '오늘 통화한 사람 중 한 명이 내일 큰 이야기 가져옴. 친절하게 받아둘 것.',
  '오랜만에 연락 안 한 사람 한 명 떠오르면 그 사람이 답. 먼저 톡 보낼 것.',
  '오늘은 사소한 약속이라도 반드시 지킬 것. 나중에 100배로 돌아옴.',
  '평소 무시하던 알림 하나가 오늘은 진짜 중요. 한 번만 더 들여다보기.',
  '회의·미팅에서 평소보다 한 박자 늦게 말하면 그 한마디가 핵심으로 박힘.',
  '인스타·카톡 프사 바꾸면 그날 연락 폭주. 단 너무 자주 바꾸면 무효.',
  '오늘 받은 영수증 하나가 한 달 내에 캐시백·환불로 돌아옴. 버리지 말 것.',
  '저녁에 마주친 강아지·고양이의 눈빛이 운세 신호. 오래 마주칠수록 길조.',
  '오후에 갑자기 잠 오면 10분만 자는 게 정답. 그 후 집중력 평소 2배.',
  '오늘 누가 부탁한 작은 일 잘 처리하면 다음 달 큰 기회로 돌아옴.',
  '거울 한 번 더 보고 나가는 날이 운수 좋은 날. 머리 하나 매무새가 결정적.',
  '점심에 새로운 사람과 식사하면 의외의 인사이트 얻음. 혼밥은 손해.',
  '오늘 들은 노래 한 곡이 일주일 내내 머릿속 BGM 됨. 그 곡을 잘 고를 것.',
  '오랜만에 책 한 페이지만 읽어도 큰 깨달음. 어떤 책이든 상관없음.',
  '오늘 사진 찍으면 인생샷. 폰 카메라 잠깐 닦고 셔터 누를 것.',
  '저녁에 안 자던 시간에 자면 내일 컨디션이 일주일 최고치.',
  '오늘 본 광고 중 하나가 이상하게 머리에 박히면 진짜 사야 할 신호. 다만 가격은 한 번 더 비교.',
  '평소 안 가던 동네 카페가 오늘은 정답. 모르는 곳일수록 좋음.',
  '오늘 만난 모든 사람한테 한 번씩 웃어주면 그날 끝에 작은 선물 옴.',
  '오후에 우연히 발견한 작은 가게가 6개월 후 인생 단골 됨.',
  '오늘 쓴 돈 중 하나는 후회되겠지만, 다른 하나는 평생 가는 투자.',
  '갑자기 떠오른 옛날 친구 이름 — 그 사람이 오늘 너를 떠올리고 있음.',
  '오늘 한 결정이 6개월 뒤 "이때부터 풀렸다" 라고 말하게 됨.',
  '점심에 김치찌개 먹으면 오후 회의가 술술 풀림. 라면은 함정.',
  '오늘은 평소보다 30분 일찍 퇴근하는 게 이득. 야근은 내일 후회만 남김.',
  '갑자기 뭔가 청소하고 싶어지면 그 욕구 따라가야 함. 그 자리에서 잃어버린 거 발견.',
  '저녁에 가족 한 명한테 안부 톡 보내면 그날 밤 잘 잠듬. 부모님이면 두 배 효과.',
  '오늘 체크할 메일 안에 오래 묻혀있던 좋은 소식 있음. 스팸함도 한번 볼 것.',
  '점심값 5천원만 아끼면 그 돈이 저녁에 정확히 5천원짜리 행운으로 돌아옴.',
  '오늘 인테리어 관련 영감 떠오르면 즉시 메모. 나중에 비싼 결정의 트리거.',
  '오후에 의외의 칭찬 들으면 부정 말고 그냥 받아둘 것. 그 사람 진심임.',
  '오늘 갑자기 운동하고 싶어지면 망설이지 말고 30분이라도 할 것. 한 달치 뭉친 게 풀림.',
  '저녁에 새 메뉴 하나 시도하면 그게 다음 주 가장 자주 먹게 되는 메뉴 됨.',
  '오늘 한 번이라도 거울 보고 웃으면 그 표정으로 만나는 사람마다 호감 +1.',
  '오후 4시쯤 맞은 햇살 5분이 오늘 비타민. 안 받으면 저녁부터 처짐.',
  '오늘 들고 다닌 가방·지갑 안에서 잊혔던 카드·기프티콘 하나 발견됨.',
  '평소 안 보던 메뉴판 안쪽 페이지에 진짜 이 집 시그니처 메뉴 숨어있음.',
  '오늘은 답장 안 온 사람한테 두 번 보내지 말 것. 내일 알아서 옴.',
];

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });

  // KST 기준 오늘 날짜
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

  // 이미 오늘치 뽑았으면 그것 반환
  const { data: existing } = await supabase
    .from('fortune_cookies')
    .select('id, fortune_text, drawn_date, created_at')
    .eq('user_id', user.id)
    .eq('drawn_date', today)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, already: true, fortune: existing });
  }

  // 새로 뽑기 — 인덱스는 (user_id + 날짜) 해시 기반 결정적, 같은 날 같은 사용자는 항상 같은 결과
  // (테이블 unique 가 막아주지만 충돌 시 같은 운세로 자연 폴백)
  let hash = 0;
  const seed = `${user.id}-${today}`;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const idx = ((hash % FORTUNES.length) + FORTUNES.length) % FORTUNES.length;
  const fortune = FORTUNES[idx];

  const { data: row, error } = await supabase
    .from('fortune_cookies')
    .insert({ user_id: user.id, fortune_text: fortune, drawn_date: today })
    .select('id, fortune_text, drawn_date, created_at')
    .single();
  if (error || !row) {
    // 동시 insert 충돌 시 다시 select 로 fallback
    const { data: again } = await supabase
      .from('fortune_cookies')
      .select('id, fortune_text, drawn_date, created_at')
      .eq('user_id', user.id)
      .eq('drawn_date', today)
      .maybeSingle();
    if (again) return NextResponse.json({ ok: true, already: true, fortune: again });
    return NextResponse.json({ error: error?.message ?? '뽑기 실패' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, already: false, fortune: row });
}
