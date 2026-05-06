import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// 사진이 지도 캡처/검색결과 스크린샷인지 AI 로 판별.
// 실제 장소(가게/공원/실내/풍경) 사진이면 통과. 화면 캡처면 차단.
//
// 흐름:
//   클라가 이미지를 storage 에 업로드 → 그 publicUrl 을 여기로 POST →
//   Claude Haiku 4.5 vision 으로 분류 → reject 면 클라가 register RPC 호출 안 함.

const PROMPT = `이 사진을 분류해주세요.

다음 중 하나라도 해당하면 "screenshot":
- 카카오맵, 네이버지도, 구글맵, 티맵 등 지도 앱의 캡처
- 카카오맵/네이버 검색 결과 화면 캡처
- 앱·웹 UI 가 보이는 스크린샷 (버튼, 메뉴, URL 바 등)
- 위성/항공 사진 위에 핀이나 라벨이 그려진 캡처

다음에 해당하면 "real":
- 실제 장소를 촬영한 사진 (실내·실외 풍경, 음식, 건물 외관, 놀이터, 공원 등)
- 인물/풍경/사물 사진

JSON 만 출력: {"verdict":"screenshot"|"real","reason":"<한국어 한 줄>"}`;

export async function POST(req: NextRequest) {
  let body: { photoUrl?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }
  const url = (body.photoUrl ?? '').trim();
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'photoUrl 필수' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 키 없으면 fail-open — 차단 안 함 (운영 사고 방지)
    return NextResponse.json({ verdict: 'real', reason: 'AI 키 없음, 통과', skipped: true });
  }

  // 이미지 다운로드 → base64 (Anthropic vision 은 url 직접도 받지만 일부 환경에서 막혀서 base64 안전)
  let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
  let base64: string;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const ct = r.headers.get('content-type') ?? '';
    if (ct.includes('png')) mediaType = 'image/png';
    else if (ct.includes('gif')) mediaType = 'image/gif';
    else if (ct.includes('webp')) mediaType = 'image/webp';
    const buf = Buffer.from(await r.arrayBuffer());
    base64 = buf.toString('base64');
  } catch (e) {
    // 사진 다운로드 실패 → fail-open (사진 자체에 의문이 있을 수 있지만 등록은 막지 않음)
    return NextResponse.json({ verdict: 'real', reason: `사진 fetch 실패: ${e instanceof Error ? e.message : String(e)}`, skipped: true });
  }

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    // JSON 추출 (마크다운 코드블럭 안에 들어있을 수 있음)
    const m = text.match(/\{[\s\S]*?\}/);
    if (!m) {
      return NextResponse.json({ verdict: 'real', reason: `AI 응답 파싱 실패: ${text.slice(0, 100)}`, skipped: true });
    }
    let parsed: { verdict?: string; reason?: string } = {};
    try { parsed = JSON.parse(m[0]); } catch { /* fallthrough */ }
    const verdict = parsed.verdict === 'screenshot' ? 'screenshot' : 'real';
    return NextResponse.json({ verdict, reason: parsed.reason ?? '' });
  } catch (e) {
    return NextResponse.json({ verdict: 'real', reason: `AI 오류: ${e instanceof Error ? e.message : String(e)}`, skipped: true });
  }
}
