---
name: smoke-test
description: v0 백엔드 E2E 스모크 실행 — signup→courses→climbs(성공/재생/중복/mock)→me/climbs→refresh→delete 14체크. 로컬 또는 프로덕션 대상. API 바꾼 뒤나 배포 후 검증할 때.
---

# 스모크 테스트

`api/scripts/smoke.mjs` — 실DB 상대 14개 E2E 체크. `API_BASE` 환경변수로 대상 전환.

## 실행

```bash
# 로컬 (api가 :3000에서 떠 있어야 함)
cd api && npm run start:dev &   # 별도 셸
node api/scripts/smoke.mjs

# 프로덕션
API_BASE=https://hiking-api-v0.fly.dev node api/scripts/smoke.mjs
```

`N passed, M failed` 출력, 실패 시 exit 1.

## 커버 (경계값 포함)

- courses bbox=8코스, 페이로드 계약(checkpointPoint/verifyRadiusM=150/LineString)
- 잘못된 bbox → 400 `VALIDATION_BBOX` 봉투
- **백운대 91m 지점 → 201 verified, flags []** (핵심 판정)
- 같은 clientRef → 200 replay / 같은 날 다른 ref → rejected `duplicate_day` + existingClimbId
- 미래 capturedAt → 400 / courseId null 폴백 → distanceM null / mock → flagged + leaderboardEligible false
- me/climbs 합계·조인 / 미인증 401 / refresh(+access토큰 거부) / soft delete 204→404

## 마무리

테스트 계정은 `smoke-*@test.local`. 프로덕션에 돌렸으면 정리:
`delete from users where email like 'smoke-%@test.local';` (cascade)
