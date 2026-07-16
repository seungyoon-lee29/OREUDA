# 04 - summit 좌표·고도 교정 (우면산·일자산·개화산·남산)

Type: fix(data)
Status: open
Triage: ready-for-agent
Depends on: 02(트림)와 같은 ETL·시드 파일 — 02 반영 후 착수
Blocked by: 일자산 해맞이광장 좌표 수동 확인(±50m 불확실 — 카카오/네이버 지도, 사용자 또는 지도 조회 가능한 에이전트)
Owner: unclaimed
Claimed at: -
Last heartbeat: -

## Objective

ws3-summit-verification.md 판정(OK 12 / WARN 2 / RED 2) 반영. RED 2건은 정상에 서도 인증이 어려운 수준.

## 핵심 (ws3 상세 참조)

| 산 | 문제 | 교정 |
| --- | --- | --- |
| 우면산 RED | 시드가 사면(231m 지점), 실정상은 공군부대 내(접근 불가). 실질 정상=소망탑이 현 checkpoint서 512m | summit→소망탑(127.01300,37.47319), 고도 293. **청계산 선례**(통제구역→대표점) |
| 일자산 RED | 고도 74m 확정 오류(→134), 좌표 저봉 계열, 크레스트서 ~170m | summit→(127.1538,37.5291)±50m — **반영 전 수동 확인 필수** |
| 개화산 WARN | 봉수대·헬기장서 142m(반경에 거의 닿음), 고도 128 | summit→(126.80617,37.58167), 고도 128 |
| 남산 WARN | 팔각정서 ~100m, 실사용 지장 없음 | 선택: (126.98810,37.55133), 고도 271 |

## 반영 범위 (mountains만으론 불충분)

1. **mountains UPDATE** — ws3 문서의 초안 SQL (프로덕션은 not-exists 가드라 시드 재실행으로 안 바뀜).
2. **courses 재생성** — 해당 산들의 checkpoint_point=구 summit 복사본이라 **인증은 여전히 구 지점**. ETL(config hint/peak 오버라이드로 교정 좌표 강제) 재실행 → 코스 checkpoint·경로 종점 갱신, source_id 불변 확인(02와 동일 불변식).
3. ETL 재발 방지: OSM 노드 이름-매칭 단독 선택 금지(아차산/우면산/개화산 중복 노드, 일자산 저봉 — ws3 "소스 오류 메모"), ele 태그 vs 공식 고도 가드(02에서 이미 추가).

## 게이트

high-risk(지오 데이터·프로덕션): 리뷰 → codex 적대 → /db-migrate(사용자 승인) → /smoke-test + 시뮬 눈검증(우면산 코스선·마커 위치).

## Out of scope

- OK 12산 재조정 · en.wiki/Wikidata 오류 정정(업스트림).
