# 등산 완등 인증 앱 (Hiking App) — v0 릴리스 레디니스 Wayfinder Map

## Destination

[명세](./spec.md)의 관찰 가능한 종료 상태: 실기기 실 GPS로 등반 세션 전 흐름 검증 → v0 릴리스 가능.

## Notes

- Profile: `high-risk` (인증 JWT·위치 프라이버시·DB 마이그레이션·멱등성·시크릿)
- Claude Code와 Codex가 이 맵을 공유 프로젝트 상태로 사용한다.

## Decisions so far

- **티켓 트래킹 이원화(확정, 2026-07-15)**: `.scratch/<effort>/`(이 맵·티켓)는 **진행 중 에이전트 작업 상태(frontier)**용, GitHub Issues(`docs/agents/issue-tracker.md`, `wayfinder:map`/`wayfinder:<type>` 라벨)는 **공개·durable 트래커(PRD·발행된 티켓)**용. 두 표면은 목적이 다르며 서로 대체하지 않는다. 규범 정의는 `docs/agents/workflow.md` §Ticket tracking surfaces.
- **트래킹 단일화(2026-07-16, 사용자 확정 — 위 이원화를 대체)**: 솔로 페이스에 과해서 접음. 트래커는 `.scratch/<effort>/` 로컬 Markdown 하나 + `HANDOFF.md` 저널. GitHub Issues는 외부 인입 전용(접는 시점 열린 이슈 0). 규범 갱신: `docs/agents/workflow.md`·`docs/agents/issue-tracker.md`.
- 프로덕션 배포(Fly, hiking-api-v0) + 스모크 18/18 통과 상태. 백엔드·DB·앱 코드 완성.
- 핵심 불변식은 `CLAUDE.md`·`docs/adr/`에 고정(geography 타입, kst_date, 에러 봉투, 멱등성, lenient 판정).

## Current frontier

- **WS1+03+02 배치: 코드·게이트 완료 (2026-07-16 저녁)** — 리뷰 게이트 전부 통과: code-reviewer 1패스 + codex 적대 2회(BLOCKER 0). 게이트 발견 반영: 스로틀 가드 auth-경로 IP 고정+refresh 불인정(HIGH 수렴 2건), capturedAt 서버 clamp(speed 우회·KST 자정 선점, MEDIUM×2), 이메일 exact 비교, 429 flush 중단, marginal 선부착 preselect 우선, testing.md 드리프트. **검증: api 4/4 · 로컬 스모크 18/18 · mobile tsc 0 · 22/22 · ETL validate 6/6.**
- **시뮬 눈검증 완료(2026-07-17 00시대)**: marginal 카피 2변형·소프트 확인·'코스 없이' 숨김(BLOCKER UI)·성공 시퀀스·삭제 버튼 노출 ✓. kst_date 자정 경계·콜드스타트 승격 E2E 우연 검증 ✓. 신규: records 중첩 삭제 버튼 VoiceOver 미도달 발견→수정→AX 실증. 잔여 3탭(삭제 Alert·M3 Alert·트림 선 눈확인)은 dev-FAB 클릭 가로채기로 자동화 불가 — 사용자 1분 수동 or 실기기에 병합. 상세 HANDOFF 2026-07-17.
- **배치 종결(2026-07-17)**: 커밋 6개 + 프로덕션 반영(DB upsert·일자산 134m·Fly 배포·프로덕션 스모크 18/18) + 잔여 3탭 사용자 확인(삭제 Alert·M3 Alert·트림 코스선) + 테스트 데이터 정리. **이번 배치 전 게이트 통과.**
- **3차 배치 완료(2026-07-17 새벽)**: ①완등 컬렉션(feat, 커밋 3f8e2e2 — 5세트·N/19·완등 화면 축하, 리뷰 1패스 반영, 31/31·시뮬 렌더) ②티켓 04 summit 교정 **resolved** — 우면산→소망탑·일자산→해맞이광장(사용자 좌표)·개화산→봉수대, 7코스 identity-보존 재라우팅, codex 적대(HIGH=풀재생성 가드 반영·MEDIUM=rowCount 단언 적용) → 프로덕션 적용+검증 0.0m ×7+스모크 18/18.
- 백로그(codex 잔여): rebuild_summits 재실행 스냅 가드 · connector 거리 63m(informational) · peakOverride fresh-fetch 경로.
- 다음 frontier: 실기기 검증(티켓 01) — 남은 유일 실질 항목.
- **WS3 완료: OK 12 / WARN 2 / RED 2** → [04 - summit 좌표 교정](./issues/04-summit-corrections.md). **우면산 = 보고된 "정상인데 인증 안 됨"의 실증**(실질 정상 소망탑이 checkpoint서 512m, 실정상은 공군부대). 일자산 좌표는 수동 확인 후 반영.
- [01 - 실기기 등반 세션 런타임 검증](./issues/01-real-device-hike-verification.md) — ready-for-human, 최후 병합 검증.
- 백로그(code-reviewer LOW): hikeStats 테스트 실물 import 전환.
- **완등 상시 색칠(2026-07-19)**: 사용자 지적(README 핵심 피치 미구현) → visibleCourses에 verified/pending 상시 포함 + useVerifiedSet 참조 안정화 + map.png 히어로 교체. 게이트: 리뷰 1패스·tsc 0·31/31·시뮬 실렌더. 백로그 추가: selectCourse 타 산 시트 플리커 · 05 §3.2 미완등 색 드리프트.

## Not yet specified

- ws4-broad-audit.md 백로그: L3(null-코스 하루 중복 인덱스, v1 마이그레이션) · L6(성공 카운터 낙관 표기) · duplicate_day 고지 카피.
- 정복 컬렉션(성취·수집 심화, grilling 확정 설계는 대화 기록) — 정합성 이슈 착지 후.
- login/signup 다크 눈검증(사소, 재로그인 시 확인).

## Out of scope

- 명세 참조(문서화로 종결된 Sentry/sslmode/throttle/커스텀 마커).
