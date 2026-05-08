// 포춘쿠키 — 오늘의 운세 뽑기. 1일 1회 (KST 기준) 한정.
// POST /api/fortune/draw — 사용자 인증 필수. 오늘치 있으면 그거 반환, 없으면 새로 뽑음.
// 생성 전략: OpenAI gpt-5-mini 로 매번 새 문장 생성 → 실패 시 하드코딩 50개에서 결정적 선택.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// AI 호출 실패 시 fallback 50개. 사주팔자·오행·전통 운세 톤. 해요체. 평일/주말 무관 표현.
const FORTUNES: string[] = [
  '오늘은 동쪽에서 들어오는 기운이 맑아요. 오전 9~11시 사이 정한 일이 술술 풀려요.',
  '토(土)의 기운이 강한 날이에요. 황색·갈색 한 가지를 걸치면 재물이 따라와요.',
  '남쪽으로 향한 자리에서 식사하면 귀인이 곁에 와요. 창가 자리가 더 좋아요.',
  '오늘의 행운 숫자는 7이에요. 망설여질 때 7과 관련된 선택을 하세요.',
  '수(水) 기운이 흐르는 날이에요. 푸른 소품 하나를 가까이 두면 막힌 일이 풀려요.',
  '짧은 만남에서 귀인이 나타나요. 처음 보는 사람도 정중히 대하세요.',
  '서두르면 잃고 기다리면 얻는 날이에요. 중요한 답은 해 진 뒤로 미루세요.',
  '오후 3시 즈음 작은 행운이 다가와요. 전화 한 통도 그냥 흘리지 마세요.',
  '화(火)의 기운으로 결단이 잘 서요. 미루던 결정 하나를 오늘 매듭지으세요.',
  '북쪽에서 들어오는 소식 하나가 길조예요. 모르는 번호도 한 번은 받아보세요.',
  '금(金)의 기운으로 재물이 모이는 날이에요. 받을 돈은 오늘 안에 정리하세요.',
  '목(木)의 기운이 약하니 무리한 추진은 다음으로 미루세요. 작은 일부터 차근히.',
  '오늘 행운의 색은 흰색이에요. 흰 셔츠·흰 양말 하나면 충분해요.',
  '잠들기 전 떠오르는 이름 하나가 답이에요. 그 사람과 인연이 깊어요.',
  '양(陽)의 기운이 강한 날이에요. 밝은 자리·창가·햇살 드는 카페가 운을 키워요.',
  '음(陰)의 기운이 차분히 흐르는 날이에요. 조용한 자리에서 하루를 정리하세요.',
  '동남쪽 방향에서 길운이 들어와요. 그 방향으로 한 번 산책하면 기운이 깨끗해져요.',
  '오늘 만난 사람의 이름에 ‘ㅇ’ 자가 들어 있다면 인연이 깊어요. 한 번 더 말 걸어보세요.',
  '묵은 빚·묵은 약속을 정리하기 좋은 날이에요. 미뤄둔 한 가지를 매듭지으세요.',
  '행운의 시간대는 정오 전후 30분이에요. 그 사이의 결정엔 길운이 따라요.',
  '토(土)와 금(金)이 어울리는 날이에요. 황금색·황토색 음식이 보양이 돼요.',
  '잠시 멈추는 사람에게 답이 오는 날이에요. 산책 중 떠오르는 생각을 메모하세요.',
  '서쪽에서 부는 바람에 잡사가 흩어져요. 창문을 잠시 열어 환기하세요.',
  '인연의 기운이 강한 날이에요. 오랜만에 떠오르는 사람한테 먼저 안부 한마디 건네세요.',
  '재물의 흐름은 늦은 오후에 들어와요. 결제·송금은 그 시간대로 미루세요.',
  '작은 약속을 지키면 큰 운이 따라오는 날이에요. 사소한 한 마디도 가볍게 보지 마세요.',
  '검은색이 운을 막는 날이에요. 검은 옷·가방을 걷어내고 다른 색 하나만 더해도 달라져요.',
  '오늘의 길운 숫자는 3이에요. 세 번 망설이면 답이 보이니 천천히 결정하세요.',
  '화(火)가 과해 들뜨기 쉬운 날이에요. 큰 약속·큰 지출은 내일로 미루세요.',
  '떠오르는 옛 인연이 있다면 그 마음이 통한 거예요. 짧게 안부 한 줄 전해보세요.',
  '동쪽 창가에서 차 한 잔이 오늘의 보약이에요. 따뜻한 차일수록 좋아요.',
  '작은 메모 하나가 큰 단서가 되는 날이에요. 떠오른 생각은 즉시 적어두세요.',
  '화·수가 부딪치는 날이에요. 감정적인 결정은 하루 미루는 게 약이에요.',
  '신발끈을 단단히 매는 날이에요. 하늘이 도와주는 길을 똑바로 걷게 돼요.',
  '거울 한 번 더 보고 나가는 사람이 운을 잡아요. 표정 하나가 결정적이에요.',
  '동전 한 닢을 주머니에 넣어두면 재물이 따라온다고 해요. 오늘 한 번 시도해 보세요.',
  '길에서 마주친 동물의 눈빛이 오늘 메시지예요. 강아지·고양이·새 어느 쪽이든 단서가 돼요.',
  '마음이 어수선할 땐 손이나 발 한 곳만 씻어도 기운이 다시 모여요.',
  '세 사람 이상에게 정중히 인사하면 그 끝에 작은 보상이 돌아와요.',
  '가족 중 한 사람을 떠올리면 그 사람이 답이에요. 부모님이라면 더 강한 길조예요.',
  '양손으로 무언가를 받는 자리가 생기는 날이에요. 정중히 받으면 그 자리에 운이 머물러요.',
  '자수성가의 별이 잠시 머무는 날이에요. 작은 시작이라도 오늘 이름을 짓고 적어두세요.',
  '동전과 지폐가 함께 들어오는 운이에요. 작은 거스름돈도 흘리지 말고 챙기세요.',
  '잠깐의 청소가 큰 운을 부르는 날이에요. 책상 한 칸·서랍 한 개만 정리해도 충분해요.',
  '입에서 나가는 말을 한 번 더 거르세요. 한 마디 아낀 만큼 운이 모여요.',
  '마음이 흔들릴 땐 따뜻한 물 한 잔이 오늘의 약이에요. 차분함이 곧 길운이에요.',
  '손에 닿은 숫자에 4가 있다면 한 번 멈추세요. 4가 두 번이면 길로 바뀌어요.',
  '가까이 있는 식물 잎사귀에 손을 한 번 대보세요. 그 자리에서 잡념이 떨어져요.',
  '오늘 떠오르는 향기가 있다면 그게 행운의 단서예요. 그 향과 가까운 곳으로 발걸음 옮기세요.',
  '잠들기 전 떠오르는 한 단어를 적어두세요. 내일 그 단어가 길을 알려줘요.',
];

// 텍스트 정규화 — 공백/특수문자 압축 후 비교용 키.
function normText(s: string): string {
  return s.replace(/\s+/g, '').replace(/["'·.,!?~]/g, '').trim();
}

// OpenAI gpt-5-mini 로 사주팔자 풍 운세 1건 생성. forbidden 에 들어있는 문구 회피.
// 평일/주말 인지 — 주말이면 직장·출근·회의·퇴근 단어 절대 금지.
async function generateFortuneWithAI(forbidden: string[], dayName: string, isWeekend: boolean): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const recentForbidden = forbidden.slice(0, 30);
  const forbiddenBlock = recentForbidden.length > 0
    ? `\n\n절대 다음 문구들과 같거나 거의 비슷하게 쓰지 마. 다른 오행/방위/숫자/색깔/시간대로 새로 써:\n${recentForbidden.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : '';
  const SYSTEM = `너는 사주팔자·주역·전통 운세에 정통한 한국어 점술가야. 한 문장으로 오늘의 운세를 뽑아.

[형식]
- 한 문장, 50~120자.
- **해요체** 종결만 사용 ("~예요", "~해요", "~돼요", "~따라요", "~좋아요", "~하세요"). 음슴체("~함", "~됨", "~할 것") 절대 금지.
- 출력은 운세 한 문장만. 따옴표·번호·해설 없음.

[내용 — 사주팔자 요소 1개 이상 필수]
- 오행: 목(木)/화(火)/토(土)/금(金)/수(水) 의 기운
- 음양: 양/음의 기운
- 방위: 동·서·남·북·동남·서북 등
- 색깔: 청·적·황·백·흑 (오방색)
- 행운 숫자: 3·5·7·8·9 등
- 시간대: 정오·해 질 무렵·자정·오전 9~11시 등
- 인연·재물·귀인·길조 같은 운세 단어
- 신비스러우면서도 일상에 적용할 행동 힌트 1개

[금지]
- 인스타·카톡·SNS·영수증·이메일 같은 현대 단어 ❌
- 너무 일상적인 "직원 추천", "메뉴 결정", "카페" 류 ❌
- ${isWeekend ? '주말이라 **직장·출근·회의·퇴근·미팅·야근** 단어 절대 사용 금지' : '평일 — 직장/회의 언급 가능하지만 굳이 안 써도 됨'}

좋은 예:
- "오늘은 동쪽에서 들어오는 기운이 맑아요. 오전 9~11시에 정한 일이 술술 풀려요."
- "토(土)의 기운이 강한 날이에요. 황색·갈색 한 가지를 걸치면 재물이 따라요."
- "수(水) 기운이 흐르는 날이에요. 푸른 소품 하나를 가까이 두면 막힌 일이 풀려요."
- "오늘 행운 숫자는 7이에요. 망설여질 때 7과 관련된 선택을 하세요."${forbiddenBlock}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `오늘은 ${dayName}요일${isWeekend ? ' (주말)' : ' (평일)'}이에요. 오늘의 운세 한 문장. forbidden 과 절대 겹치지 않게.` },
        ],
        max_completion_tokens: 100,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = await res.json();
    const raw = j?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') return null;
    const text = raw.trim().replace(/^["「『]/, '').replace(/["」』]$/, '').trim();
    if (text.length < 20 || text.length > 300) return null;
    return text;
  } catch {
    return null;
  }
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });

  // KST 기준 오늘 날짜 + 요일 (주말/평일 인지용)
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const today = kstNow.toISOString().slice(0, 10);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[kstNow.getUTCDay()];
  const isWeekend = dayName === '토' || dayName === '일';

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

  // 중복 차단 데이터 수집 — (a) 오늘 모든 사람 + (b) 이 사용자가 과거에 뽑은 모든 운세.
  const [{ data: todayRows }, { data: mineRows }] = await Promise.all([
    supabase
      .from('fortune_cookies')
      .select('fortune_text')
      .eq('drawn_date', today)
      .is('deleted_at', null),
    supabase
      .from('fortune_cookies')
      .select('fortune_text')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  const forbidden: string[] = [
    ...((todayRows ?? []) as Array<{ fortune_text: string }>).map((r) => r.fortune_text),
    ...((mineRows ?? []) as Array<{ fortune_text: string }>).map((r) => r.fortune_text),
  ];
  const forbiddenSet = new Set(forbidden.map(normText));

  // AI 시도 — 최대 2회. 응답이 forbidden 과 같거나 정규화 동일하면 재시도.
  let fortune: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const candidate = await generateFortuneWithAI(forbidden, dayName, isWeekend);
    if (!candidate) break;  // 키/네트워크 문제 — 더 시도해도 의미 없음
    if (!forbiddenSet.has(normText(candidate))) { fortune = candidate; break; }
  }

  // AI 실패·전부 중복 시 fallback — FORTUNES 에서 forbidden 제외하고 해시 선택.
  if (!fortune) {
    const pool = FORTUNES.filter((t) => !forbiddenSet.has(normText(t)));
    if (pool.length > 0) {
      let hash = 0;
      const seed = `${user.id}-${today}`;
      for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
      const idx = ((hash % pool.length) + pool.length) % pool.length;
      fortune = pool[idx];
    } else {
      // 풀까지 다 떨어지면 — fallback 50개 중에서 그냥 해시 (이론상 거의 없음)
      let hash = 0;
      const seed = `${user.id}-${today}`;
      for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
      const idx = ((hash % FORTUNES.length) + FORTUNES.length) % FORTUNES.length;
      fortune = FORTUNES[idx];
    }
  }

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
