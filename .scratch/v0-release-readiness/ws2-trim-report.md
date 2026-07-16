# WS2 — 코스 접근로 트림 리포트 (티켓 02)

날짜: 2026-07-16. 변경 파일: `supabase/etl/build.mjs`, `supabase/seed_seoul.sql`(재생성). **커밋·프로덕션 미적용.**

## 구현 요약

1. **트림**: 경로 복원 시 간선별 way id(`edgeWays`)를 수집, 선두(들머리 쪽)에서 `highway=footway` way 간선을 연속 제거. 첫 `path|steps|track` 간선에서 정지. 잔여 길이가 `m.minDist` 이하로 떨어지면 중단(소산 공원길 보호).
2. **불변**: `source_id`는 트림 **전** firstWay 기준(기존 로직 그대로, 주석으로 고정). bearing/이름은 트림 전 원 endpoint 기준. checkpoint(정상점) 불변.
3. **재계산**: `distance_m` = 트림 후 잔여 간선 haversine 합(Dijkstra 거리 − 제거 간선 합). `duration_min`·`difficulty`는 새 dist로 기존 휴리스틱 적용.
4. **[L9] easy 휴리스틱**: 상승 우선 — `ascent < 100`이면 `distM < 4000`까지 easy. (기존: distM≥2500이면 무조건 not-easy.)
5. **[M6] ele 가드**: OSM peak ele와 config ele 괴리 >30m면 config 우선 + warn. 실제 발동: **일자산 74.2 → 134** (seed의 mountains 값 74→134 정정. 프로덕션 mountains는 not-exists 가드라 이 파일로는 갱신 안 됨 — 별도 티켓).

## 검증 결과

- `node --test supabase/etl/validate.mjs` — **6/6 pass**.
- 코스 수: before 42 = after 42 (seed.sql 8개 불변 → 총 50 유지).
- source_id 42개 diff: **전부 동일** (only-before=[], only-after=[]).
- checkpoint 동일: 42/42. 코스 이름 동일: 42/42.
- 트림 발생 **10개** / 트림 0(원래 깨끗) **32개**.
- 트림된 10개 코스의 새 시작점을 캐시 way tags로 스팟 확인(안산 서측·남산 북서측·일자산 남측·우면산 북동측): 전부 footway↔steps/path 경계 노드 — 설계대로 정지.
- 트림 0인 대형 코스(도봉 북서 3334m·불암 서 3277m·수락 3코스 등)는 선두 way가 `highway=path` — footway-한정 트림 설계상 대상 아님(티켓 out-of-scope: fetch 필터 변경은 v0 제외, "트림으로 충분한지 먼저 검증" 항목). **잔존 이슈로 기록**: OSM이 접근로를 path로 태깅한 산은 이 트림으로 안 잡힘.

## before/after 비교표 (트림 발생 10개)

s→sum = 시작점→정상 직선(m), plen = 경로 폴리라인 길이(m), distM = distance_m 필드.

| 코스 | s→sum B | s→sum A | plen B | plen A | distM B | distM A | difficulty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 안산 서측 | 2134 | 730 | 4247 | 1141 | 4255 | 1118 | moderate→easy |
| 남산 북서측 | 1251 | 1182 | 2508 | 1633 | 2546 | 1654 | moderate→easy |
| 구룡산 북서측 | 1423 | 1188 | 2375 | 1518 | 2412 | 1546 | easy |
| 일자산 남측 | 1385 | 855 | 1812 | 1031 | 1851 | 1070 | easy |
| 우면산 북동측 | 2240 | 1680 | 2619 | 1967 | 2661 | 2006 | moderate→easy |
| 아차산 북서측 | 1488 | 1600 | 2670 | 2358 | 2782 | 2455 | moderate→easy |
| 북악산 서측 | 1572 | 1614 | 3955 | 3712 | 4139 | 3900 | moderate |
| 용마산 서측 | 624 | 588 | 1222 | 1019 | 1275 | 1065 | easy |
| 인왕산 북서측 | 1116 | 1101 | 2082 | 1880 | 2154 | 1957 | easy |
| 안산 북측 | 1952 | 1944 | 4058 | 3906 | 4166 | 4020 | moderate |

(아차산 북서·북악산 서측은 s→sum 직선이 소폭 증가 — 제거된 footway가 정상 쪽으로 감아 돌던 구간. 경로 길이는 감소, 정상 판정.)

difficulty 변경 5건: 위 moderate→easy 4건 + **일자산 동측**(트림 0, L9 휴리스틱 + ele 정정으로 ascent 94m → easy).

트림 0인 32개는 s→sum·plen·distM·difficulty 전 필드 동일.

## 프로덕션 반영 방법 (이 작업 범위 아님 — 사용자 승인 후)

`seed_seoul.sql`은 courses가 `on conflict (source_id) do update` upsert라 **그대로 실행하면 42개 코스가 갱신**된다(path/checkpoint/distance_m/duration_min/difficulty). mountains는 not-exists 가드라 무해(일자산 elevation 정정은 별도 티켓). 절차: 게이트(리뷰→적대 리뷰) 통과 후 `/db-migrate`로 사용자 승인 하에 적용 → `/smoke-test`.

비교 스크립트: `scratchpad/compare_trim.py`, before 스냅샷: `scratchpad/seed_seoul.before.sql`.
