# ws5 — summit 교정 + 코스 재라우팅 리포트 (v1, 2026-07-17)

티켓 04 구현. 우면산(RED)·일자산(RED)·개화산(WARN) summit 교정 + 해당 7코스 재라우팅.
남산(WARN, 선택)은 티켓대로 스킵. **커밋·프로덕션 미적용 — 파일 생성까지만.**

## 산출물

| 파일 | 내용 |
| --- | --- |
| `supabase/etl/rebuild_summits.mjs` | 신규. 캐시 그래프 → peakOverride 최근접 노드 Dijkstra → 기존 들머리(고정값)에서 재라우팅. rebuild_v0 패턴(identity 보존) + build.mjs 선두 footway 트림·simplify·checkpoint 스냅 동일 적용. corrections SQL 생성 + seed in-place 동기화 |
| `supabase/summit_corrections.sql` | 프로덕션용. mountains UPDATE ×3 + courses UPDATE ×7 (source_id 특정). 트랜잭션 없음 — 적용 시 감쌀 것 |
| `supabase/etl/config.mjs` | 3산에 `peakOverride { pt, ele }` 추가 (향후 재생성에도 교정 유지) |
| `supabase/etl/build.mjs` | peakOverride 지원: 좌표·ele 최우선, 스냅 생략, raw에 `정상점=ws3 교정 좌표` 표기 |
| `supabase/seed_seoul.sql` | mountains 3행 + 코스 블록 7개 치환(재시딩 일관성). 그 외 바이트 불변 |

## summit 이동

| 산 | 구 → 신 (lng, lat) | 고도 | 이동거리 | 근거 |
| --- | --- | --- | --- | --- |
| 우면산 | (127.00727, 37.47245) → (127.013, 37.47319) 소망탑 | 313→293 | ~512m | 실정상 공군부대 접근불가 — 청계산 통제구역 선례 |
| 일자산 | (127.15201, 37.52854) → (127.1537, 37.529) 해맞이광장 | 134 유지 | ~158m | 사용자 지도 확인(2026-07-17), WS3 DEM과 14m 정합 |
| 개화산 | (126.80518, 37.58268) → (126.80617, 37.58167) 봉수대·헬기장 | 132→128 | ~142m | OSM 128.4 노드 + 강서구 공식 |

## 코스 검증표 (7/7 PASS)

checkpoint↔신규 summit 거리는 전 코스 **0m**(스냅으로 보장). 시작점 이동 전부 **0m**
(기존 들머리에서 재라우팅, 선두 footway 없어 트림 0간선 — 티켓 02 트림이 이미 반영된 시작점이라 예상 결과).

| 코스 (source_id) | 거리 구→신 | 시간 구→신 | 난이도 구→신 | pt | 들머리snap |
| --- | --- | --- | --- | --- | --- |
| 우면산 남측 (osm-way-816075678) | 3186→3810m | 74→81min | moderate 유지 | 50 | 0m |
| 우면산 북동측 (osm-way-1481658401) | 2006→1504m | 56→47min | easy 유지 | 16 | 0m |
| 우면산 북서측 (osm-way-792788520) | 988→1612m | 41→48min | easy 유지 | 21 | 0m |
| 개화산 남동측 (osm-way-1358899464) | 3220→2565m | 59→48min | **moderate→easy** | 27 | 0m |
| 개화산 남서측 (osm-way-1383576858) | 563→597m | 19→19min | easy 유지 | 11 | 0m |
| 일자산 동측 (osm-way-478392845) | 2537→2372m | 47→45min | easy 유지 | 24 | 0m |
| 일자산 남측 (osm-way-1524491289) | 1070→1166m | 25→27min | easy 유지 | 14 | 0m |

- 개화산 남동측 easy 강등은 휴리스틱 정상 동작: 신규 ascent 98m(<100) + 경로 단축(우회 제거).
- 신규 summit ↔ 최근접 등산로 노드: 우면산 2m / 일자산 49m / 개화산 64m — 전부 캐시 내,
  Overpass 재수집 불필요. path 종점은 최근접 노드에서 summit으로 ≤64m 직선 스냅
  (build.mjs 기존 관례 ≤100m와 동일, verify_radius 150m 내 인증 문제없음).
- duration은 ascent를 신규 고도 기준 재계산(우면산 263→243m, 개화산 102→98m, 일자산 94m 유지).

## 불변식·게이트 검증

| 체크 | 결과 |
| --- | --- |
| source_id 집합 42/42 불변 (seed 전/후 diff) | PASS |
| 코스 id·이름·mountain_id 불변 (UPDATE만, 치환 키=기존 블록 캡처) | PASS |
| `node --test supabase/etl/validate.mjs` (bbox·pt수·checkpoint=path끝·source_id·difficulty) | 6/6 PASS |
| seed 내 3산 코스 checkpoint == mountains summit 행 (수치 일치 스크립트) | 7/7 PASS |
| build.mjs 풀 재생성 실험 (백업→실행→diff→복원) | summit 3행 동일값 재생성 확인 — override 유지됨 |

## 발견 이슈

1. **build.mjs 풀 재생성은 여전히 identity-unsafe**: override로 summit은 유지되지만 목표점이
   바뀌어 코스 셀렉션이 드리프트한다(실험: 우면산 3→2코스, 개화산 2→3코스 + firstWay 변경
   1383576858→1383576837). 풀 재생성 산출물을 프로덕션에 그대로 upsert하면 신규 행 생성 +
   기존 코스 고아화 — 재라우팅은 반드시 rebuild_summits/rebuild_v0 방식으로. (기존 성질, 악화 아님)
2. 일자산 캐시 수집반경(1800m) 경계에 신규 summit이 걸치지만(hint 기준 ~1780m) way 지오메트리가
   반경 밖까지 포함돼 실측 최근접 49m — 문제없음.

## 프로덕션 적용 절차 (메인 게이트 후)

high-risk(지오 데이터) 풀 게이트: 리뷰 → codex 적대적 리뷰 → 메인 판단 → 적용.

1. **사전 캡처**:
   ```sql
   select m.name, m.elevation_m, st_astext(m.summit_point::geometry) from mountains m where m.name in ('우면산','일자산','개화산');
   select c.id, c.source_id, c.distance_m, c.duration_min, c.difficulty from courses c where c.source_id in ('osm-way-816075678','osm-way-1481658401','osm-way-792788520','osm-way-1358899464','osm-way-1383576858','osm-way-478392845','osm-way-1524491289');
   ```
2. **적용**: `supabase/summit_corrections.sql` 전체를 하나의 트랜잭션으로 (supabase MCP `execute_sql` 또는 psql `begin; … commit;`). UPDATE만이라 climbs FK·기존 기록 안전. 영향 행수 확인: mountains 3, courses 7.
3. **사후 검증**:
   ```sql
   select c.source_id, round(st_distance(c.checkpoint_point, m.summit_point)) as d_m
   from courses c join mountains m on m.id = c.mountain_id
   where m.name in ('우면산','일자산','개화산');  -- 7행 전부 d_m = 0 기대
   ```
4. `/smoke-test` (프로덕션 대상) + 시뮬 눈검증: 우면산 코스선이 소망탑까지 이어지고 마커가 소망탑 위인지 (티켓 04 게이트).
5. 참고: seed 재실행으로는 mountains가 안 바뀜(not-exists 가드) — corrections SQL이 유일한 프로덕션 반영 경로. courses는 upsert라 재시딩 시에도 신규 값 유지.
