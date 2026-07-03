# 규칙 — 백엔드 API (api/ 다룰 때)

`api/src/**` 를 건드릴 때 적용. 상세는 `docs/02-backend-spec.md`.

- **지오는 raw SQL(PostGIS)**. TypeORM 엔티티는 `users`만(ADR-002). 거리 판정은 `ST_DWithin(geography, geography, meters)` — 좌표 타입은 반드시 `geography`.
- **에러 봉투 고정**: `{ error: { code, message } }`. 새 실패 경로는 `code` 상수를 추가하고 클라이언트 분기와 맞춘다. 500은 메시지 마스킹.
- **트랜잭션 대신 제약-이름 디스패치**: 삽입 충돌은 `e.driverError.constraint`로 분기(`uq_climbs_client_ref`→replay, `uq_climbs_daily`→거절+existingClimbId). 새 유니크 제약 추가 시 이 디스패치도 갱신.
- **판정은 관대하게**: 거리/속도/mock 이상은 거절이 아니라 flag. 거절 사유는 `capturedAt` 유효성(미래/파싱불가)과 중복뿐.
- **인증**: access 1h / refresh 90d(type:'refresh'). refresh 토큰으로 보호 API 접근은 거부.
- **throttle**: 로그인은 IP 기준. Fly 뒤라 trust proxy 필수(실 IP).
- ponytail: 도메인당 1파일(auth/catalog/climbs/http), 모듈 1개 유지. 나누고 싶어지면 먼저 근거를 대라.
