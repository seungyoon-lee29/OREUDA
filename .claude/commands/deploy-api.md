---
description: api/ 를 Fly.io(hiking-api-v0, nrt)에 배포하고 헬스체크 + 프로덕션 스모크로 검증
argument-hint: (인자 없음)
allowed-tools: Bash(flyctl *), Bash(fly *), Bash(node *)
---

api/ 백엔드를 Fly.io에 배포한다.

1. `cd api` 후 커밋 상태 확인 — 미커밋 변경 있으면 사용자에게 먼저 커밋할지 물어라.
2. 시크릿 확인: `flyctl secrets list -a hiking-api-v0` 에 `DATABASE_URL`·`JWT_SECRET` 존재 확인(값은 보지 않는다).
3. 배포: `flyctl deploy -a hiking-api-v0`.
4. 헬스체크: `curl -s https://hiking-api-v0.fly.dev/v1/healthz` → 200 (DB 안 건드리는 라이트 체크).
5. 프로덕션 스모크: `API_BASE=https://hiking-api-v0.fly.dev node scripts/smoke.mjs` — 14/14 확인.
6. 스모크 통과하면 테스트 데이터 정리(`/smoke-test` 스킬의 마무리 SQL).

주의: Fly 머신은 auto stop/start라 첫 요청 콜드스타트 2~3초 정상. 무료 정책상 헬스체크는 DB를 건드리지 않는다.
