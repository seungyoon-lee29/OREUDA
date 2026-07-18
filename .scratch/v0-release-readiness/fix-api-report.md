# fix-api-report — 03-ws4-fixbatch API 3건 (H1b·M1·L1)

2026-07-16 · 대상: api/ 만 (mobile/·supabase/ 무수정) · 커밋 안 함 (지시대로)
climbs.ts·verification.test.ts의 기존 미커밋 accuracy-flag 변경은 보존됨.

## H1b — 스로틀 키 IP→userId (인증 요청만)

- `api/src/http.ts:44-72` — `UserOrIpThrottlerGuard extends ThrottlerGuard`, `getTracker` 오버라이드 1클래스.
  - 핵심: **글로벌 가드는 컨트롤러 레벨 AuthGuard보다 먼저 실행**되어 `req.userId`가 아직 없다. 그래서 tracker가 Authorization 토큰을 직접 `jwt.verify`해 `user:{sub}` 키를 만든다(verify 1회 중복 — 무시 가능).
  - 무효 토큰·토큰 없음(로그인/가입 등 비인증) → `req.ip` 폴백. api-design 규칙 "로그인은 IP 기준" 유지.
  - JwtService는 `@Inject` 프로퍼티 주입 — 부모 constructor(`@InjectThrottlerOptions` 등) 재선언 회피 (ponytail 주석).
- `api/src/app.module.ts:9,24` — APP_GUARD를 `ThrottlerGuard` → `UserOrIpThrottlerGuard`로 교체.
- `api/src/auth.ts:72-73` — 낡은 ponytail 주석 갱신(커스텀 tracker 부재 전제였음).

## M1 — capturedAt future 판정 시계 skew 허용오차 2분

- `api/src/climbs.ts:60-68` — `export const SKEW_MS = 120_000`, 판정을 `+capturedAt > +now + SKEW_MS`로. 이유 주석: 자동 시간 끄고 시계를 몇 분 빠르게 쓰는 기기는 모든 인증이 4xx(=클라 영구 실패) 전면 장애.
- `api/src/verification.test.ts:62-63` — 경계 2케이스: `now+SKEW_MS` == 통과(null), `now+SKEW_MS+1s` = 'future'. 기존 `12:00:01Z → future` 케이스는 새 경계로 대체.

## L1 — 가입 이메일 unique 레이스 → 409

- `api/src/auth.ts:56-69` — `users.save`를 try/catch로 감싸고 `e?.driverError?.constraint === 'users_email_key'`면 `err(409, 'AUTH_EMAIL_TAKEN', ...)` 재던짐(제약-이름 디스패치 규칙). 기존 exists 선체크는 유지(정상 경로 UX).
- 제약명 검증: 마이그레이션은 인라인 unique(`20260703000000_init.sql:7`)라 PG 기본명 추정 → **실DB `pg_constraint` 조회로 확인**: `users_email_key` (및 `users_provider_provider_user_id_key`). 값 미출력, 제약명만 조회.

## 테스트 결과 (`cd api && npm test` = tsc && node --test)

```
# Subtest: computeFlags — 03 §2
ok 1 - computeFlags — 03 §2
# Subtest: capturedAtError — 03 §4 (+M1 시계 skew 허용오차)
ok 2 - capturedAtError — 03 §4 (+M1 시계 skew 허용오차)
# Subtest: UserOrIpThrottlerGuard.getTracker — H1b: 유효 토큰=userId, 그 외=IP
ok 3 - UserOrIpThrottlerGuard.getTracker — H1b: 유효 토큰=userId, 그 외=IP
# Subtest: parseBbox
ok 4 - parseBbox
1..4
# tests 4  # pass 4  # fail 0
```

- computeFlags 기존 테스트 불변(accuracy flag 케이스 포함, ok 1).
- 추가 테스트: skew 경계 2케이스 + getTracker 분기 3케이스(유효 토큰/무효 토큰/무토큰 — DI 없이 프로토타입 스텁, `verification.test.ts:69-88`).

## 런타임 검증 (로컬 부트)

- DI(프로퍼티 주입 가드)가 컴파일로는 안 잡히는 위험이라 실부트 확인: `PORT=3987` + 일회용 JWT_SECRET(로컬 .env의 JWT_SECRET이 32자 미만이라 main.ts 부트 게이트에 걸림 — 기존 로컬 환경 문제, .env는 안 건드림)으로 기동 → 전 라우트 매핑 정상.
- `POST /v1/auth/login`(비인증, 오답) → 401 `AUTH_INVALID_CREDENTIALS` — tracker IP 폴백 경로에서 500 없음.
- `POST /v1/climbs`(garbage 토큰) → 401 `AUTH_UNAUTHORIZED` — tracker 무효토큰 폴백 → AuthGuard 401 정상.
- 프로세스 종료 확인(잔존 없음).

## 남은 것 / 참고

- 티켓 게이트: "H1b·M1·L1은 codex 적대 리뷰 1회 추가" — 이 배치 밖(부모 세션에서 진행).
- /smoke-test(프로덕션/전구간 E2E)는 배포 후 완등 게이트에서 — 이번엔 유닛+로컬 부트까지.
- 로컬 `.env`의 JWT_SECRET이 32자 미만이라 로컬 기동이 원래 안 되는 상태(내 변경과 무관). 로컬 스모크 돌리려면 갱신 필요.
