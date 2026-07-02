# ADR-002. 지오 스택 — PostGIS + TypeORM

- 상태: 승인 (2026-07)

## 상황

핵심 테이블 전부가 지오 타입이다: `courses.path`(LineString), `mountains.summit_point` / `courses.checkpoint_point` / `climbs.verified_point`(Point). 판정 쿼리는 `ST_DWithin`, 조회는 bbox `ST_Intersects`. NestJS(TypeScript) 백엔드.

## 결정

**PostgreSQL + PostGIS**, ORM은 **TypeORM**. 스페이셜 연산은 QueryBuilder raw 표현식, 마이그레이션은 TypeORM migration.

## 근거 — ORM 비교 (2026 기준 검증)

| ORM | PostGIS 지원 | 판정 |
|---|---|---|
| **TypeORM** | geometry/geography 컬럼 타입 공식 지원(GeoJSON 인터체인지), NestJS 공식 통합 | **채택** — 어차피 ST_* 함수는 raw로 쓰지만, 컬럼 타입·마이그레이션·hydration이 네이티브 |
| Prisma | **PostGIS 네이티브 미지원 지속** — geo 컬럼은 `Unsupported()` + `$queryRaw` 우회만 | 기각 — 모든 핵심 테이블이 geo인 프로젝트에서 ORM의 이점이 소멸 |
| Drizzle | geometry(Point)만 공식 지원, LineString은 커스텀 타입 우회 | 기각 — courses.path가 LineString |

포트폴리오 관점: "Prisma를 배제한 근거(PostGIS 지원 격차)"를 이 문서로 남기는 것 자체가 기술 선택 역량의 증거다.

## 핵심 설계 규칙

1. **포인트 비교 컬럼은 `geography(Point,4326)`** — `ST_DWithin` 셋째 인자가 미터가 된다. `geometry`로 선언하면 도(degree) 단위: `150` = 반경 약 16,000km, **전 제출이 무증상 통과**. 이 함정을 테스트 경계값 표(README)에 degree 오류 케이스로 고정한다. 클라 측 이중 가드는 [03 §5](../03-verification.md).
2. `courses.path`는 전송·렌더용이라 `geometry(LineString,4326)` — 연산 대상 아님.
3. 단순화(`ST_SimplifyPreserveTopology`)는 4326에서 직접 하지 않는다(톨러런스가 degree) — EPSG:5179 투영 후 미터 단위로, **시딩 시점 사전 계산**[v1] ([06 §3](../06-data-pipeline.md)).
4. GIST 인덱스: [02 §3](../02-backend-spec.md).

## 결과

- Testcontainers(postgis 이미지)로 판정 쿼리 통합 테스트 — README 테스트 절.
- 호스팅은 PostGIS 지원 관리형 DB로 제약됨 → [ADR-003](./ADR-003-hosting.md).
