# 지오/코스 데이터 감사 — 진단 결과 (2026-07-16)

diagnosing-bugs 스킬로 진행. 감사 스크립트: `scratchpad/audit_courses.py`(시드 파싱 + haversine, 50코스).

## 확정 (RED)

1. **클라이언트 인증 게이트가 서버 관대성·문서 불변식 위반** — capture.tsx
   - `accuracy > 100`(L105), `dist > verifyRadiusM(150)`(L127) → **막다른 차단**('다시 시도'만).
   - 서버(climbs.ts)는 거리=`distance` flag만, status는 항상 `verified`(절대 거절 안 함). CLAUDE.md "판정은 관대하게" 불변식.
   - ⇒ "정상 올랐는데 완등 안됨"의 진짜 원인. marginal GPS(정확도 나쁨/좌표 약간 벗어남)에서 앱이 완등을 막음.
   - **결정: flag 통과(서버와 일치)** — 막다른 차단 제거, 항상 제출, marginal은 flag.
   - ⚠️ 서버 flag는 distance/speed/mock뿐 — **accuracy flag 없음**. 정확도 게이트 제거하면 저정확도가 무플래그 verified. → 서버에 `accuracy` flag 추가로 불변식 완성(백엔드 변경).

2. **경로에 접근로(들머리 진입) 포함** — 50코스 데이터
   - 경로 시작이 정상서 직선 3~4.4km(북한산성 사당능선 3.6km, 도봉/불암/수락 3km대), plen 5~6km.
   - 원인: ETL(build.mjs)이 정상서 수집반경 안 **가장 먼 말단**을 들머리로 선택 → OSM footway(도로/역 접근로)에 착지.
   - **결정: 들머리부터 시작하도록 트림**(사용자 요청: 접근로 안내 불필요).

## 반증 (가설이었으나 데이터가 부정)

- ❌ "checkpoint가 정상과 멀다": 49/50 코스 ck→summit=ck→pathend=end→summit=**0**(완벽 정렬).
- ❌ "비봉 배너/인증 불일치": 배너·인증 둘 다 코스 checkpoint 사용(index.tsx L101-165). 비봉은 백운대와 다른 봉이라 의도된 것.
- RED 1건(북한산 비봉 ck→summit 3762m)은 내 summit-기준 지표의 false positive.

## 미확정 (실측 대조 필요)

- 16 OSM 서울산 **summit 좌표가 실제 정상과 어긋날 가능성** — 데이터상 checkpoint=summit이라 기하 감사로 못 잡음. OSM peak 노드 ≠ 실제 정상 마커면, checkpoint 정확해도 정상서 >150m 가능.

## 워크스트림 (전부 고위험 — 리뷰→적대적(codex)→판단→/db-migrate→/smoke-test)

| # | 티켓 | 범위 | 게이트 |
| --- | --- | --- | --- |
| WS1 | 클라이언트 관대성 + 서버 accuracy flag | mobile capture.tsx + api climbs.ts | 리뷰+적대 |
| WS2 | 경로 접근로 트림(ETL 재생성) | supabase/etl/ + seed + prod | 리뷰+적대+/db-migrate |
| WS3 | summit 좌표 실측 대조(16산) | 조사(research) | 확인 후 반영 |
| WS4 | 광범위 감사(duration/difficulty/거리 정합 등) | 조사 | 발견별 |

## 파킹

- 정복 컬렉션 기능(grilling 확정분) → 이 이슈들 뒤로. 별도 티켓.
