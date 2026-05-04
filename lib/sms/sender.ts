import crypto from 'crypto';

// Naver Cloud SENS — SMS 발송
// docs: https://api.ncloud-docs.com/docs/ai-application-service-sens-smsv2
//
// 필요 env:
//   NCP_ACCESS_KEY      : NCP 콘솔 → 마이페이지 → 인증키 관리
//   NCP_SECRET_KEY      : 위와 같이
//   NCP_SMS_SERVICE_ID  : SENS 콘솔 → SMS 서비스 → 서비스 ID (ncpXXXXXXX 형태)
//   NCP_SMS_FROM        : 등록·승인된 발신번호

type SendArgs = {
  to: string;        // 수신번호 (숫자만, 010xxxxxxxx)
  text: string;      // 본문 (90바이트 이하 SMS / 그 이상 LMS 자동)
};

export async function sendSms({ to, text }: SendArgs): Promise<{ ok: true } | { ok: false; error: string }> {
  const accessKey = process.env.NCP_ACCESS_KEY;
  const secretKey = process.env.NCP_SECRET_KEY;
  const serviceId = process.env.NCP_SMS_SERVICE_ID;
  const from = process.env.NCP_SMS_FROM;
  if (!accessKey || !secretKey || !serviceId || !from) {
    return { ok: false, error: 'NCP_SMS env not set' };
  }

  const timestamp = Date.now().toString();
  const method = 'POST';
  const url = `/sms/v2/services/${serviceId}/messages`;

  // 시그니처: HMAC-SHA256(secretKey, "{method} {url}\n{timestamp}\n{accessKey}") → base64
  const signingString = `${method} ${url}\n${timestamp}\n${accessKey}`;
  const signature = crypto.createHmac('sha256', secretKey).update(signingString).digest('base64');

  // 90바이트 이하면 SMS, 초과면 LMS. 한글 1자=2바이트 가정.
  const byteLen = Buffer.byteLength(text, 'utf8');
  const type = byteLen <= 80 ? 'SMS' : 'LMS';

  const res = await fetch(`https://sens.apigw.ntruss.com${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-ncp-apigw-timestamp': timestamp,
      'x-ncp-iam-access-key': accessKey,
      'x-ncp-apigw-signature-v2': signature,
    },
    body: JSON.stringify({
      type,
      from,
      content: text,
      messages: [{ to, content: text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, error: `sens ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

// 폰번호 정규화 — 숫자만 남기기
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (!/^010\d{8}$/.test(digits)) return null;
  return digits;
}

// 6자리 인증코드 생성
export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 해시 (salt + code) — 단순 sha256, 5분 TTL 라 충분
export function hashCode(salt: string, code: string): string {
  return crypto.createHash('sha256').update(salt + code).digest('hex');
}

// env 기반 안전장치 설정 (운영 중 숫자만 조정 가능)
export function smsConfig() {
  return {
    codeTtlMin: Number(process.env.SMS_CODE_TTL_MIN ?? 5),
    hourlyLimitPerPhone: Number(process.env.SMS_HOURLY_LIMIT_PER_PHONE ?? 5),
    verificationValidMin: Number(process.env.SMS_VERIFICATION_VALID_MIN ?? 30),
    maxAttempts: Number(process.env.SMS_MAX_ATTEMPTS ?? 5),
  };
}
