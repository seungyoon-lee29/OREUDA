# 02 - 코스 경로 접근로 트림 (지하철역 시작 제거)

Type: fix(data)
Status: open
Triage: ready-for-agent
Depends on: None (WS4 감사 완료 후 착수 — 파일 충돌 회피)
Blocked by: None
Owner: unclaimed
Claimed at: -
Last heartbeat: -

## Objective

코스 라인이 들머리(등산로 입구)부터 시작하게 한다. 현재 일부 코스가 지하철역/도로부터 시작(접근로 포함) — 사용자 결정: 들머리까지 가는 길은 안내하지 않는다.

## 근본 원인 (진단 완료 — findings-geo-audit.md)

- `supabase/etl/fetch.mjs:62` — way 수집이 `path|footway|steps|track` 포함. footway(도시 보도)가 역 주변 접근로를 쓸어옴.
- `supabase/etl/build.mjs:99-101` — 들머리 후보 = 차수 1 말단을 **먼 순** 선택 → 도시 footway 사슬 끝이 들머리로 뽑힘.
- 감사 수치: 경로 시작→정상 직선 3~4.4km 코스 다수(도봉 북서 3334m, 불암 서 3277m 등), plen 5~6km.

## 설계 (확정)

1. 수정 위치는 **build.mjs만** — 캐시(etl/data/*.json)에 way tags가 이미 있어 재-fetch 불필요.
2. 트림 규칙: 경로(들머리→정상) 선두에서 `footway` 간선 연속 구간 제거, 첫 `path|steps|track`에서 정지. **잔여 ≤ m.minDist면 트림 중단**(소산 공원길 보호).
3. **source_id는 트림 전 firstWay 유지** — upsert 갱신 경로 보존(안 지키면 코스 중복 + climbs FK 단절). rebuild_v0 선례.
4. distM·durMin·difficulty는 트림 후 길이로 재계산.
5. v0 3산(seed.sql)은 수동 큐레이션 들머리라 대상 아님(감사에서 접근로 신호 없음 — 사당능선 3625m는 사당역 들머리가 실제 코스 기점).

## Acceptance criteria

- 재생성 seed_seoul.sql에서 footway-선두 코스의 시작이 들머리로 이동(감사 스크립트 before/after 비교표).
- 코스 수 50 유지(±0 — 트림으로 소실 없음), source_id 전부 동일(diff로 확인).
- `node --test supabase/etl/validate.mjs` 통과.
- 프로덕션 적용 SQL(UPDATE by source_id) 준비 — 적용 자체는 /db-migrate로 사용자 승인 후.
- 시뮬 눈검증: 도봉산·수락산 코스 라인이 산 안에서 시작.

## 게이트 (high-risk: 프로덕션 지오 데이터)

리뷰 → 적대 리뷰(codex) → 메인 판단 → /db-migrate → /smoke-test.

## Out of scope

- summit 좌표 교정(WS3 결과 대기 — 별도 티켓 가능성).
- fetch.mjs way 필터 변경(재-fetch 필요해 v0 스코프 아웃, 트림으로 충분한지 먼저 검증).
