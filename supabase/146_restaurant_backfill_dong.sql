-- ──────────────────────────────────────────────
-- 146: 기존 restaurant_pins.dong 백필 — address 에서 행정동 추출
--
-- regex: '[가-힣]+동' 뒤에 공백 또는 문자열 끝
-- → '서울 성동구 도선동 123' 에서 '도선동' 매칭 ('성동구' 의 '성동' 은 뒤에 '구' 라 skip)
-- ──────────────────────────────────────────────

update public.restaurant_pins
  set dong = (regexp_match(address, '([가-힣]+동)(\s|$)'))[1]
  where dong is null
    and address is not null
    and address ~ '[가-힣]+동(\s|$)';

-- 결과 확인용 (실행 후 자동 출력)
select id, name, address, dong from public.restaurant_pins where deleted_at is null order by created_at desc;
