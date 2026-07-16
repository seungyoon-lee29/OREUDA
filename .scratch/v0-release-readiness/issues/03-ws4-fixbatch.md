# 03 - WS4 퀵픽스 배치 (감사 발견 수정)

Type: fix
Status: open
Triage: ready-for-agent
Depends on: None
Blocked by: 서브에이전트 세션 한도 17:50 리셋 대기 (사용자 결정: 직접 수정 대신 위임)
Owner: unclaimed
Claimed at: -
Last heartbeat: -

## Objective

`ws4-broad-audit.md` 발견 중 사용자 승인된 수정 배치. 근거·수정방향은 감사 문서의 각 항목 참조.

## Scope (승인됨)

| # | 항목 | 파일 | 크기 |
| --- | --- | --- | --- |
| H1 | 429(+401)를 failed_permanent → queued 재큐 (Retry-After 존중은 선택) | mobile outbox.ts | 분기 1 |
| H1b | climbs 쓰기 스로틀 키 IP→userId | api app.module/climbs | 소 |
| H2 | 같은 계정 재로그인 시 draft 보존 — 마지막 계정 식별자(이메일 해시) 로컬 보관, 다른 계정일 때만 purge | mobile login/signup/prefs | 중 |
| H3 | '나중에 선택할게요'→'코스 없이 기록할게요' 카피 + records 완등 카드 삭제 액션(서버 DELETE 재사용, 확인 Alert) | mobile capture/records | 중 |
| M1 | capturedAt future 판정에 2~5분 시계 skew 허용오차 | api climbs.ts | 상수 1 |
| M2 | computeHikeSummary duration 상한(16h) 초과 시 null | mobile hikeStats.ts | 가드 1 |
| M3 | 등반 중 다른 코스 시작 시 확인 Alert | mobile index.tsx | Alert 1 |
| M4 | 미전송 초안 삭제 확인 Alert | mobile records.tsx | Alert 1 |
| M7 | records '이미 인증된 코스' 죽은 else 분기 삭제 | mobile records.tsx | 삭제 |
| L1 | 가입 이메일 unique 충돌 → 409 AUTH_EMAIL_TAKEN (제약-디스패치 규칙) | api auth.ts | catch 1 |
| L2 | profile 배지 칩 '정복'→'완등' (CONTEXT.md 금칙어) | mobile profile.tsx | 1단어 |
| L5 | search/index 조회 실패 시 에러+재시도 빈상태 (records 패턴 재사용) | mobile search/index | 소 |
| L8 | 타일 bbox lng [-180,180] clamp | mobile geo.ts | 1줄 |

## 제외/이관 (결정 기록)

- M5(Sentry): docs 하향으로 종결(03 §5 갱신됨, HANDOFF rank9 블록 유지).
- M6·L9(시드 모순·난이도 휴리스틱): WS2(02-path-trim) ETL 작업에 병합.
- L3(null-코스 하루 중복 인덱스): v1 마이그레이션 백로그 — 고위험 DB 변경이라 별도 게이트.
- L4: WS1에서 수정 완료. L6(성공 카운터 낙관 표기)·duplicate_day 고지: 연출/카피 백로그.
- L7은 H3에 포함(삭제 UI).

## Acceptance criteria

- api: `npm test` 통과 + 새 경계 테스트(skew 경계, 429 재큐는 유닛 시임 없으면 코드리뷰로). mobile: `npx tsc` 0 + 단위 통과.
- 완등 게이트: /smoke-test 통과(api 변경분), 시뮬 눈검증은 WS1과 묶어 1회.
- 게이트: 일반 코드 = code-reviewer 1패스. H1b·M1·L1(서버 판정 경로)은 codex 적대 1회 추가.

## Out of scope

- 서버 PATCH(사후 코스 부착) — 사용자가 기각.
