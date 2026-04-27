# 멜른버그 결제페이지 프로젝트

## 프로젝트 개요
멜른버그의 상품(상담 2종 + 멤버십 2종)을 단일 페이지에서 즉시 결제할 수 있는
정적 HTML 결제페이지와, 결제 후 자동화 파이프라인 구축 프로젝트.

---

## 워크플로우 진입점

| 요청 유형 | 진입 스킬 | 트리거 예시 |
|-----------|----------|------------|
| 결제페이지 생성·수정 | `payment-page-builder` | "결제페이지 만들어줘", "가격 변경", "상품 추가" |
| 결제 후 자동화 | `post-payment-automation` | "결제 완료", "입금 확인", 폼 응답 감지 |
| 블로그 작성 | `blog-posting` | "블로그 글 써줘", 주제 제시 |

---

## 결제페이지 변경 규칙

1. **상품 데이터**: `output/products.json`만 수정
2. **HTML 재생성**: `.claude/skills/payment-page-builder/scripts/render_html.py` 실행
3. **레이아웃·디자인 변경**: `.claude/skills/payment-page-builder/references/template.html` 수정 후 렌더러 실행
4. **직접 HTML 수정 금지** — 다음 렌더링 때 덮어씌워짐

```bash
python .claude/skills/payment-page-builder/scripts/render_html.py
```

---

## 브랜드 규칙

- **컬러**: PPT 기본 파랑 계통 3색만 사용
  - 다크 네이비 `#002060` (메인 — 헤드라인·버튼·텍스트)
  - 미드 블루 `#0070C0` (hover·푸터·보조)
  - 라이트 시안 `#00B0F0` (액센트 — 번호·체크·강조)
- **폰트**: Pretendard (CDN 임베드)
- **톤**: 짧고 밀도 높은 문장, 음슴체 ("정리함." "발송드림.")
- **금지**: 과장 표현, 불필요한 수식어, 위 3색 외 다른 컬러

---

## 상품 목록 (현재)

| 상품 | 가격 | 파일명 |
|------|------|--------|
| 짧은상담 | 33,000원 | `output/짧은상담.html` |
| 중간상담 | 99,000원 | `output/중간상담.html` |
| 멜른버그 2분기 신규가입 | 109,000원 | `output/신규가입.html` |
| 멜른버그 2분기 갱신 | 99,000원 | `output/갱신.html` |

---

## 미확정 플레이스홀더 (채워야 할 항목)

`output/products.json`에서 아래 값을 실제 링크로 교체하면 HTML이 자동 반영됨.

| 필드 | 현재 값 | 교체할 내용 |
|------|---------|------------|
| `google_form_url` | `GOOGLE_FORM_URL_*` | 구글 폼 임베드 URL |
| `kakaopay_link` | `KAKAOPAY_LINK_*` | 카카오페이 결제 링크 |
| `naverpay_link` | `NAVERPAY_LINK_*` | 네이버페이 결제 링크 |
| `openchat_link` | `OPENCHAT_LINK_PLACEHOLDER` | 오픈채팅 링크 |

---

## 사람 검토가 필요한 단계

- [ ] 결제페이지 최종 시각 확인 (브라우저에서 열어보기)
- [ ] 구글 폼 생성 + 시트 연결 → `google_form_url` 채우기
- [ ] 카카오페이·네이버페이 링크 생성 → 각 `*pay_link` 채우기
- [ ] 오픈채팅 링크 → `openchat_link` 채우기
- [ ] 카페 등업 JS 실행 (콘솔에서 직접)

---

## 출력 파일 위치

모든 산출물은 `/output/`에 저장:
- `*.html` — 상품별 결제페이지
- `products.json` — 상품 구성 데이터 (단일 진실 출처)
- `payments_log.json` — 결제 처리 이력 (post-payment-automation이 기록)
- `sms_log.jsonl` — SMS 발송 로그
- `cafe_upgrade_script_YYYYMMDD.js` — 등업 JS (콘솔 실행용)
