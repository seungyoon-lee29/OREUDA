# feat: 정복 컬렉션 (완등 세트) — 구현 보고

mobile/ 만 수정, 백엔드 무변경, 커밋 안 함. UI 문구는 '완등 세트'/'완등'만('정복'은 도메인 주석에만).

## 파일별 수정

| 파일 | 내용 |
| --- | --- |
| `mobile/src/lib/mountainSets.ts` (신규, 71줄) | SETS 5개 SSOT(:11-17) + 파생 함수: `verifiedByMountain`(:24-34, me/climbs→산 이름별 verified 코스 id Set), `conqueredMountains`(:36-45, courseCount 기반 산 완등 판정), `setProgress`(:48-50), `newlyAchieved`(:54-71, 직전/직후 비교 — capture 배너용). tiers.ts 스타일 주석·SSOT 선언 |
| `mobile/src/lib/mountainSets.test.js` (신규, 9 테스트) | SETS 정합(19산/겹침1/세트 내 중복無), verifiedByMountain 필터·dedupe, 산 1/2=미완등·2/2=완등 경계, courseCount 0 가드, setProgress 부분/완성, newlyAchieved 3분기(아무것도/산만/산+세트) + 재완등 no-op |
| `mobile/src/lib/colored.ts` | `useMountains()` 훅 추가(:32-40) — queryKey `['mountains']`, staleTime Infinity. search·profile·capture 공용(캐시 1회 fetch) |
| `mobile/src/app/search.tsx` | 인라인 `['mountains']` useQuery → `useMountains()`로 교체(:33-34) — 중복 정의 드리프트 제거. 동작 동일 |
| `mobile/src/app/(tabs)/profile.tsx` | '완등 세트' 섹션(:76-102, 배지 아래·로그아웃 위): 헤더 행(제목 + 글로벌 `N/{mountains.length}산 완등` — 카탈로그 미로드 시 숨김), 세트별 가로 카드(이름·x/y MONO·완성 시 success 보더 + 기존 badgeChip '완성' 재사용). 스타일 :191-207, 기존 C/R/SP 토큰만 |
| `mobile/src/app/capture.tsx` | `captured` 상태에 `feats: string[]` 추가(:27). `chooseCourse`에서 setState 직전 동기 계산(:204-216): `newlyAchieved(직전 me/climbs 캐시, +이번 코스)` → `🏔 ○○산 전 코스 완등!` / `🎖 ○○ 완성!` 문자열. Captured에 feats prop(:331·:383·:390) → counterChip 스타일 그대로 칩 렌더(:421-427). 위저드 상태머신·confirm_marginal 구조 무변경 |

## 검증

- `npx tsc --noEmit` → exit 0
- `node --test src/lib/*.test.js` → **31 pass / 0 fail** (신규 9 포함)
- `npx eslint` (수정 5파일) → exit 0
- 시뮬 미실행(지시대로 — 메인 통합 검증 대상)

## UI 구조

- **profile**: 배지 섹션 아래 `setHeader`(sectionTitle '완등 세트' + 우측 글로벌 카운트 MONO) → SETS 순서대로 5개 행 카드. 카드 = 기존 카드 문법(surface + 1px border + R.card), 완성 시 borderColor→C.success + badgeChip '완성'.
- **capture**: 인증 완료 화면에서 `[새 달성 칩들] → [지금까지 N좌 완등] → [운동 요약]` 순. 칩은 counterChip/counterText 재사용, 추가 애니 없음(기존 진입 스프링에 자연 포함).

## 설계 이슈 발견 (메인 판단 필요)

1. **`GET /v1/courses` bbox 없이 전체 — 현 API에 없음**: `parseBbox`가 bbox 누락 시 400(`VALIDATION_BBOX`, api/src/catalog.ts:39). 백엔드 무변경 제약이라 이 경로는 불가. 대신 **명세가 우선하라고 한 기존 데이터 경로 재사용**으로 해결: `/mountains`의 `courseCount` × `me/climbs`의 verified 코스 귀속(`mountain.name`+`courseId`)으로 "전 코스 완등"을 판정. 코스는 정확히 한 산에 종속(서버 join)이므로 '카탈로그∩verifiedSet' 교집합과 수학적 동치 — 전 코스 LineString 다운로드 없이 기존 쿼리 2개로 끝남. `conqueredMountains` 시그니처가 명세의 `(코스 카탈로그, verifiedSet)` 대신 `(카탈로그, verifiedByMountain맵)`인 이유.
2. **오프라인 콜드 스타트**: `['mountains']`·`['me-climbs']`가 메모리 캐시뿐이라 오프라인 콜드 스타트 시 완등 세트 진행이 0/y로 보이고 capture 배너 스킵(기존 profile 완등 수와 동일한 한계 — 새 회귀 아님). react-query persistor 도입 여부는 별개 결정.
3. **outbox pending 미반영**: 배너 '직전 상태'는 verified(me/climbs)만 — 미flush pending 완등은 계산에 안 들어감. 예: 오프라인으로 A코스 인증 후 B코스로 산이 완성돼도 배너 안 뜸(profile은 flush 후 정상 표시). lenient 원칙상 수용 가능하다고 판단, 필요 시 pendingCourseIds 합류로 확장 가능.
4. **세트 카드에 산 목록 미표시**: 명세 그대로(이름·x/y·완성 강조만). "어느 산이 남았나"는 카드에 없음 — 필요 시 후속.
