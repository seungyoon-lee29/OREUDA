# 규칙 — 테스트 (테스트 파일 다룰 때)

이 프로젝트의 테스트 관례. `*.spec.ts`, `*.test.*`, `scripts/smoke*` 를 건드릴 때 적용.

- **프레임워크 최소화**: 요청 없으면 새 러너·픽스처 도입 금지. NestJS는 기본 Jest, 그 외는 `node --test` + `assert`.
- **비자명 로직 하나당 실행 가능한 체크 하나**: 분기/루프/파서/판정(거리·속도·mock)·머니/시큐리티 경로는 최소한의 assert 체크를 남긴다. 자명한 한 줄은 테스트 불필요(YAGNI).
- **경계값 우선**: 판정 로직은 경계에서 검증한다. 예) 백운대 체크포인트 91m=통과 / 500m=flag `distance`, 정확도 100m=통과 / 101m=flag `accuracy` — 둘 다 거절 아님(관대 판정, 03 §3). 속도 200km/h 경계. capturedAt은 skew(+2분) 경계.
- **멱등성·중복**: `client_ref` 재전송=200 replay, 같은 날 중복=`uq_climbs_daily` 거절 — 이 둘은 반드시 커버.
- **실DB E2E**는 스모크로: 로컬 또는 프로덕션 대상. `/smoke-test` 스킬 참조. 테스트 데이터는 끝나고 정리(`delete from users where email like 'smoke-%@test.local'`).
