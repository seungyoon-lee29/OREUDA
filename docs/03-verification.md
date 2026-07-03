# 03. 완등 인증 검증 (Verification) — 서버 상태 시맨틱 정본

> **이 문서가 서버 판정 상태(`status`, `flags`)의 단일 정본(SSOT)이다.**
> 저장·인덱스는 [02](./02-backend-spec.md)가, 클라이언트 큐 상태와 서버→클라 매핑은 [04 §4](./04-client-architecture.md)가, 시각 표현은 [05 §4](./05-design.md)가 담당하며 모두 이 문서를 참조한다. 같은 라이프사이클을 다른 문서에서 재정의하지 않는다.

## 1. 인증 모델 개요

- 인증 단위는 **코스**다. 검증 기준점은 산이 아니라 코스에 귀속된다: `courses.checkpoint_point`(v0~v1: 경로 종점 또는 수동 지정 — 등산로 SHP는 2D라 "최고 고도점 자동 산출"은 불가능, DEM 결합은 로드맵).
- 판정식 (서버):

```sql
ST_DWithin(
  climb.verified_point,        -- geography(Point,4326)
  course.checkpoint_point,     -- geography(Point,4326)
  mountain.verify_radius_m     -- 기본 150
)
```

- **geography 타입 필수.** `geometry`로 선언하면 세 번째 인자 단위가 도(degree)가 되어 `150` = 반경 약 16,000km — 모든 제출이 조용히 통과하는 무증상 버그다. [02 §3](./02-backend-spec.md)의 컬럼 정의와 README 테스트 경계값 표(degree 단위 오류 케이스 포함)가 이를 가드한다.
- 클라이언트는 같은 판정을 **haversine(미터)로 로컬 근사** 계산해 오프라인에서도 위저드가 동작한다 ([04 §5](./04-client-architecture.md)). 이를 위해 courses 응답에 `checkpoint_point`와 `verify_radius_m`이 포함되는 것이 API 계약이다 ([02 §5](./02-backend-spec.md)).

## 2. 서버 상태 — `verified | rejected` 2값 + `flags[]`

v0 검증은 **`POST /v1/climbs` 트랜잭션 내 동기 처리**다(ST_DWithin 1쿼리 + unique 충돌 감지 — 비동기로 만들 이유가 없다). 따라서 서버에 "pending" 상태가 존재하는 순간이 없다. "대기 중"은 클라이언트 outbox의 `queued`가 전담한다.

```
status: 'verified' | 'rejected'     -- text + CHECK. 'pending'은 v1 비동기 검증 대비로
                                    -- CHECK에만 예약, v0에서는 사용하지 않음
flags:  text[]                      -- verified 전용 신뢰도 플래그. 평시 '{}'
```

| flag | 의미 | 발생 조건 |
|---|---|---|
| `distance` | 거리 판정 실패했으나 관대 정책으로 수용 | 로컬 판정은 통과 주장, 서버 계산 거리 > verify_radius_m |
| `speed` | 물리적으로 비현실적인 이동 | 직전 verified 인증 대비 이동 속도 > 200km/h (`captured_at` 기준 계산) |
| `mock` | 위치 조작 신호 | 클라 payload의 `is_mock=true` (Android 한정, §6) |

- `flags`는 JSONB 안이 아니라 **독립 `text[]` 컬럼**이다 — 리더보드 제외 필터(`WHERE flags = '{}'`)가 인덱싱 가능해야 한다 [v1].
- `leaderboard_eligible = (flags = '{}')`는 응답에서 파생값으로 제공한다.

### rejected 도달 경로 — v0에서는 중복 단일

| 경로 | v0 | 비고 |
|---|---|---|
| `duplicate_day` — (user, course, KST 날짜) 중복 | O | partial unique 충돌. **검증 전이 시점에 발생** ([02 §3](./02-backend-spec.md)) |
| 만료(expired) | **없음** | §4 참조 — v0에서 만료 규칙 자체가 없다 |

거리·속도·mock은 rejected가 아니라 **flagged verified**다(§3).

## 3. 관대 정책 (Lenient Acceptance)

> **로컬 판정을 통과한 제출은 서버가 원칙적으로 수용한다. 서버 측 검증 실패는 거부가 아니라 flagged 강등이다.**

근거: v0의 제출 경로는 "정상에서 캡처 → 하산 후 앱을 열 때 제출"이다. 사용자가 인증 실패를 통보받는 시점에 재시도는 물리적으로 불가능하다(이미 하산했다). 거부는 회복 불가능한 UX이므로, 명백한 종결 케이스(중복)에만 쓴다.

- **flagged의 효과**: 사용자 본인의 지도에서는 verified와 **완전히 동일**하다 — 색칠 유지, 구분 뱃지 없음 ([05 §4](./05-design.md)). 차이는 리더보드 집계 제외[v1]뿐이다.
- **거리 공개**: 판정 거리 `distance_m`은 성공/실패 무관 **상시 응답에 포함**한다. 로컬 판정이 이미 클라에서 거리를 계산하므로 숨겨도 보안 이득이 없고, "체크포인트까지 몇 m 남았는지"는 야외에서 가장 필요한 정보다.

## 4. `captured_at` 신뢰 정책 — 72h 만료 없음 (v0)

`captured_at`(현장 캡처 시각)은 **클라이언트 주장값**이며 서버는 이를 검증할 수단이 없다. 이 사실을 숨기지 않고 명시적 수용 리스크로 기록한다:

- sanity 체크 (v0): `captured_at`이 **미래가 아닐 것**, `captured_at ≤ submitted_at`일 것. 위반은 4xx 종결(스키마 오류 취급).
- **72h 만료 규칙은 v0에 없다.** 이유:
  1. v0의 유일한 제출 경로는 "다음 앱 오픈"인데(포그라운드 flush만, [04 §6](./04-client-architecture.md)) 나흘 뒤 앱을 여는 것은 정상 사용 패턴이다 — 만료는 정직한 사용자를 가장 자주 처벌하는 규칙이 된다.
  2. v0에는 기기 무결성 증명(attestation)이 전무해서 curl로도 제출 가능하다 — 시간 제한의 보안 이득이 0이다.
- [v1] 백그라운드 업로드와 함께 만료 개념 재도입 — 단 "만료=무효화"가 아니라 **"만료=flagged 제출(captured_at 신뢰도 하향)"**로 정의한다.
- 속도 sanity(§2의 `speed`)는 제출 시각이 아니라 **`captured_at` 기준**으로 계산한다 — 지연 제출이 정상이므로.

## 5. 위협 모델 — 정직한 한계 서술

완벽한 부정행위 차단은 불가능하며, 이 문서는 무엇을 막고 무엇을 수용하는지 명시한다.

| 위협 | 대응 | 잔여 리스크 |
|---|---|---|
| Mock location 앱 | Android: `Location.mocked` 플래그 → `mock` flag. **iOS: 대응 API 없음 — 미탐지를 명시적으로 수용** | 루팅 기기의 시스템 레벨 스푸핑은 Android에서도 우회 |
| GPS 정확도 불량 | `accuracy > 100m`는 클라 위저드에서 캡처 차단 ([04 §5](./04-client-architecture.md)) | 정확도 값 자체도 클라 주장값 |
| 시각 조작 | §4 sanity + `speed` flag (자동 거부 아님 — 오탐 내재적: 하루 두 산 차량 이동은 정상) | captured_at 위조 |
| API 직접 호출(curl) | v0 없음 — 수용 리스크로 명시 | [v2] Play Integrity / App Attest가 근본 대책 |
| 단위 버그(무증상 전부 통과) | geography 캐스팅 + 경계값 테스트 + 클라 가드: `verify_radius_m` zod `min(10).max(2000)`, 로컬 거리 vs 서버 `distance_m` 괴리 시 Sentry 이벤트 | — |

**설계 철학**: v0의 부정 인센티브는 낮다(개인 지도 색칠, 금전 보상 없음). 차단보다 **탐지·기록(flags)**을 택하고, 리더보드[v1]처럼 인센티브가 생기는 시점에 flags 필터가 방어선이 된다.

## 6. 검증 입력 payload (클라 → 서버)

```
courseId        uuid | null    -- null 허용: "나중에 선택" 폴백
clientRef       uuid           -- outbox 행의 local_uuid, 멱등키
lat, lng        number         -- 캡처 시점 위치
accuracyM       number
isMock          boolean        -- Android만 유의미, iOS는 항상 false
capturedAt      ISO8601
```

응답 스키마는 [02 §5](./02-backend-spec.md)가 정본.

## 7. 알려진 근사치 — 포인트 인증의 한계

체크포인트 반경 인증은 **"그 지점에 있었다"의 증명이지 "그 코스로 올라왔다"의 증명이 아니다.** 케이블카·차량으로 접근 가능한 정상에서 최난이도 코스를 선택해 인증하는 것을 v0~v1은 막지 못한다. 이 한계를 숨기지 않고 문서화하며, 해소는 트랙로그 기반 완주 검증(로드맵, [01 §9](./01-product-spec.md))이 담당한다.
