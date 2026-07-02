# ADR-003. 호스팅 — Supabase + Fly.io (+ R2 [v1])

- 상태: 승인 (2026-07) — v0 착수 전 유일하게 필요한 인프라 결정

## 상황

1인 개발 포트폴리오+실서비스. 제약: PostGIS 필수([ADR-002](./ADR-002-geo-stack.md)), 월 비용 상한 필요, **면접 시연 가능한 상시 데모 URL**이 산출물이다. 지도 SDK 때문에 NCP 계정은 어차피 만든다([ADR-001](./ADR-001-map-sdk.md)).

## 결정 (기본값)

| 계층 | 선택 | 무료/저비용 근거 |
|---|---|---|
| DB | **Supabase** (managed Postgres + PostGIS extension) | 무료 티어로 v0~v1 충분 |
| API | **Fly.io** (NestJS 컨테이너) | 소형 VM 무료~수 달러 |
| 스토리지 [v1] | **Cloudflare R2** | egress 무료, S3 호환, **lifecycle rule 지원**(pending/ 48h 자동 삭제 — [07 §3](../07-security-privacy.md) 전제) |

월 비용 상한 목표: v0 $0~5, v1 $5~15 (+ Apple Developer $99/년은 별도 고정비).

## 알려진 리스크 (실측·검증 필요 항목)

1. **Fly.io는 서울 리전이 없다** — 최근접 nrt(도쿄). Supabase 서울(ap-northeast-2) DB와 API 사이 쿼리당 왕복 ~30-40ms 누적. 완화: (a) climbs flush는 비동기 큐라 클라 체감 없음([04 §6](../04-client-architecture.md)), (b) 조회 API는 쿼리 수를 화면당 1~2개로 설계, (c) **Supabase도 도쿄 리전으로 맞추는 옵션**을 v0 셋업 시 실측 후 결정. 문서 작성이 아니라 **배포 후 p95 실측**으로 판단한다.
2. **Supabase 무료 티어는 7일 미사용 시 pause** — 면접 시연 리스크. 완화: uptime ping(cron) 또는 시연 전 웜업 체크리스트, 필요 시 유료 전환($25/mo)은 면접 시즌에만.
3. Fly 무료 정책은 유동적 — 착수 시점 재확인.

## 기각한 대안

| 대안 | 사유 |
|---|---|
| NCP 서버 + 도커 Postgres | 서울 리전·과금 통합 장점은 있으나 관리형 DB가 아니라 백업·운영 부담이 1인 개발에 과함. **차선책으로 유지** — Fly/Supabase 무료 정책이 무너지면 이쪽 |
| AWS RDS | PostGIS는 되지만 프리 티어 이후 비용이 포트폴리오에 과함 |
| Neon | PostGIS 지원·무료 티어 좋으나 Supabase 대비 이점 없음(어차피 auth/storage는 자체 구현) |
| Railway | 무료 티어 축소 이력 — 지속성 불확실 |

## 결과

- v0 셋업 순서: NCP 키 발급(결제수단 등록) → Supabase 프로젝트(PostGIS extension 활성) → Fly 배포 → 시딩 SQL 실행.
- docker-compose(postgis)로 로컬 개발 환경 동일 구성 — README 개발 환경 절.
