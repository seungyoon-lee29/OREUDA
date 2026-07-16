# 핸드오프 — 2026-07-17 (지오 정합성 배치: 인증 관대성·경로 트림·감사 픽스 — 미커밋)

## 방금 한 것 (전부 워킹트리, 커밋 보류 — 사용자 결정 대기)
사용자 보고 2건("코스가 지하철역부터 시작", "정상인데 완등 안 됨")에서 출발, diagnosing-bugs로 진단 → 서브에이전트 4배치(api/mobile/ETL/조사) + 리뷰 게이트(code-reviewer 1패스 + codex 적대 3회, BLOCKER 0 종결) → 시뮬 눈검증.
- **WS1 인증 관대성**: 클라 막다른 차단(out_of_range/low_accuracy) → `confirm_marginal` 소프트 확인("그래도 인증하기"). marginal은 nearest(또는 preselect) 코스 **선부착**(적대 BLOCKER: '나중에 선택' null 코스로 distance flag 회피 차단 — marginal에선 그 버튼 숨김). 서버 `accuracy` flag(>100m) 신설. 문구 '나중에 선택할게요'→'코스 없이 기록할게요'.
- **api 픽스**: 스로틀 키 IP→userId 가드(`UserOrIpThrottlerGuard`, auth 경로는 IP 고정+refresh 불인정 — 적대·리뷰어 HIGH 수렴 반영, req.path+대소문자·쿼리 우회 차단) / capturedAt skew 2분 허용 + **서버 clamp**(미래시각 저장 시 speed 우회·KST 자정 duplicate 슬롯 선점 차단) / 가입 이메일 레이스 409(제약-디스패치).
- **mobile 픽스(감사 ws4)**: 429·401 flush 재큐(+429는 루프 중단), 같은 계정 재로그인 draft 보존(`reconcileLocalDataForAccount`, exact 이메일 비교), 완등 삭제 UI(records, DELETE 재사용+확인 Alert), 스테일 세션 요약 가드(16h), 등반 덮어쓰기·초안 삭제 확인 Alert, 죽은 분기 삭제, '정복'→'완등', 검색/지도 에러 빈상태, tile lng clamp.
- **ETL 경로 트림(ws2)**: build.mjs 선두 footway 연속 구간 제거(잔여≤minDist 보호), source_id/이름/checkpoint 불변(upsert 연속성), 10/42 코스 트림(안산 서측 4255→1118m 등), easy 휴리스틱 상승 우선, ele 가드(일자산 74→134 seed만). validate 6/6.
- **summit 실측(ws3)**: OK12/WARN2/**RED2** — **우면산이 "정상인데 인증 안 됨"의 실증**(실질 정상 소망탑이 checkpoint서 512m, 실정상은 공군부대 → 청계산 선례로 소망탑 채택 권고), 일자산 74→134m 확정. `.scratch/v0-release-readiness/ws3-summit-verification.md`(교정 UPDATE 초안 포함). **coursesのcheckpoint 재생성까지 필요**(티켓 04).
- **docs 정합**: 03(accuracy flag·위협모델·Sentry [v1] 하향)·04(confirm_marginal 상태도·큐 무보관 실물·산-탭 게이트)·05(원탭 예외·카피 표)·testing.md(flag 경계).
- **시뮬 눈검증(cliclick+AX)**: marginal 멀리/조금 카피·사유 병기 ✓, 그래도 인증→marginal select에서 '코스 없이' 숨김 ✓(BLOCKER UI), 도착확인·성공 시퀀스·기록 삭제버튼 노출 ✓. **자정 넘김으로 kst_date·콜드스타트 승격·선부착 제출 E2E 우연 검증** ✓. **신규 발견+수정**: records 카드가 중첩 삭제 버튼을 AX에서 가림(VoiceOver 도달 불가) → 래퍼 `accessible={false}`, AX 트리 노출 실증. L6(성공 카운터 stale 점프) 라이브 재현 — 백로그 유지.
- **검증 최종**: api 4/4 + 로컬 스모크 18/18(일회용 JWT_SECRET 부트) · mobile tsc 0 + 22/22 · ETL validate 6/6.

## 커밋·배포 완료 (2026-07-17 01시대, 사용자 승인 "차례대로 진행")
- **커밋 5개**: 228c4f5 api / 12f369a mobile / 04b768b data 트림 / 4db7aef docs / a1b4741 스캐폴드+상태. 미커밋 잔여 0.
- **프로덕션 DB**: seed_seoul.sql upsert(42코스, 트랜잭션) + 일자산 134m — 검증: 코스 50, 안산 서측 1118m·easy, ST_DWithin 91m=T/500m=F, checkpoint=경로끝 0.0m, source_id 42.
- **API 배포**(Fly): healthz 200 + **프로덕션 스모크 18/18** + 스모크 데이터 정리(climbs 16·users 4).

## 시뮬 잔여 3탭 — 사용자 직접 확인 완료 (2026-07-17)
완등 삭제 Alert(+테스트 완등 2건 정리), M3 등반 덮어쓰기 Alert, 트림 코스선(안산) 눈확인 — 전부 통과. 이로써 이번 배치의 런타임 검증 전 항목 종결. Metro·시뮬 정리됨.

## 다음 할 것
1. **티켓 04**(summit 교정: 우면산 소망탑·개화산 + courses checkpoint 재생성) — 일자산 해맞이광장 좌표 수동 확인(카카오/네이버 지도) 후 착수.
2. **정복 컬렉션**(성취·수집 심화 — grilling으로 설계 확정: 산 정복=전 코스, 큐레이션 5세트 전 산 커버, profile 확장, 완등 화면 인라인 축하, 클라 파생 전용) — 파킹 해제 가능.
3. 실기기 검증(frontier 01)·STITCH 키 로테이션 — 변동 없음.

---

# 핸드오프 — 2026-07-16 (작업규칙 하네스·루프 재구성 — docs-only)

## 방금 한 것
- **CLAUDE.md 재구성** — `@AGENTS.md` import(공용 워크플로가 Claude 세션에도 로드), 규칙을 **하네스**(로딩 그래프·우선순위·도구 인벤토리·훅·SSOT)와 **루프**(시작→위임→게이트→완료 게이트→기록) 두 절로 재편. 중복 Wayfinder 블록 제거(원본=AGENTS.md), 스테일 '지금 상태' 절 제거(상태 SSOT=이 파일+`.scratch/`).
- **CONTEXT.md** — placeholder → 확정 도메인 용어 12개(완등/'정복' 금칙·lenient·replay·아웃박스·등반 세션 등).
- **workflow.md** — Scale 절 추가: 스캐폴드는 기능 규모용, trivial은 게이트만. high-risk 표면(지오·마이그레이션·RLS·멱등성·인증·시크릿)은 규모 무관 예외 없음.
- **드리프트 수정** — README 상태(검색·다크·등반 세션 v0.5 반영, '정복 지도'→'완등 지도'), smoke-test 스킬·deploy-api의 하드코딩 체크 개수 제거(기준=스크립트 출력).
- **시크릿 발견 보고** — CLAUDE.local.md + `.claude/settings.local.json`에 STITCH_API_KEY 평문(전역 하한 위반) → 로테이션 + 셸 env 이관 권고. allowlist의 keychain 조회 항목(`security dump-keychain` 등) 제거 권고. 값은 미출력.
- **(같은 날 후속) 규칙 미세조정** — ①위임 모델 라우팅: 하위 티어 기본(기계적=haiku·구현/리뷰=sonnet·판단/적대 리뷰만 세션 모델, `code-reviewer`=sonnet 고정) — 미지정 상속이 토큰 과다의 주범이었음. ②진행상황 읽기 단일화: 활성 effort면 map.md 하나, 없으면 HANDOFF 최신 항목. ③**티켓 트래킹 단일화**: GitHub Issues 이원화 접음(사용자 확정, 열린 이슈 0) — 트래커는 `.scratch/` 하나, 규범은 workflow.md·issue-tracker.md 갱신.

## 다음 할 것 — 변동 없음
1. **실기기 런타임 검증**(`.scratch/v0-release-readiness` frontier 01) — 유일한 실질 잔여.
2. STITCH 키 로테이션 + 로컬 파일 2곳에서 평문 제거(사용자 직접).

---

# 핸드오프 — 2026-07-07 (내 위치 FAB + 리포 정리)

## 방금 한 것 (커밋 9adff91, origin push 완료)
- **'내 위치로' FAB(우하단)** — 등반 중 `myPos` 있을 때만 뜨는 glass 원형. 탭 시 내비 화살표 위치로 카메라 리센터(줌 `Math.max(현재줌,14)` — 줌인만, 사용자 조작 존중). 아이콘은 `nav-arrow.png` 재사용 → "이 버튼=저 화살표" 시각 연결. `index.tsx` `locFab`.
- **포니테일 코드리뷰 반영(code-reviewer 에이전트)** — Blocker 0. **High**: watch 구독 누수 수정 — `watchPositionAsync` resolve 후 `cancelled` 재확인→self-remove(assign 전 정리가 돌면 구독이 붕 떠 등반 종료 후에도 GPS 폴링하던 "백그라운드 추적 안 함" 계약 위반). **Medium**: FAB 줌 강제 완화 + 네이티브 위치버튼 대비 의도 주석화. Low(Balanced 정확도 vs 반경): 라벨 전용·서버 판정 권위라 무변경.
- **"화살표/코스 따로 논다" = 코드 무결** — 시뮬 가짜 GPS(청계산 잔류)가 원인이었음. GPS를 관악산 들머리로 옮기니 화살표가 코스 시작점에 붙음(배너 7.7→3.2km). 실기기선 사용자가 들머리에 서 있어 항상 코스 위.
- **리포 정리** — `scratchpad/`(임시 스샷 13M) 삭제 + `.gitignore` 등록. CLAUDE.md smoke 경로 수정(`../scratchpad/smoke.mjs`→`scripts/smoke.mjs`). 죽은 코드 정리(mobile/api/supabase, 병렬 에이전트) — 상세는 커밋 참조.

---

# 핸드오프 — 2026-07-06 (기능 확충 v0.5)

## 방금 한 것 (커밋 419a5e2, 로컬 — push 필요)
멀티에이전트 병렬(기획·디자인·데이터·FE×3·풀스택·리뷰)로 기능 확충 + Summit Precision 다크 전환. 22파일 +1366/−155.
- **데이터**: `supabase/seed_seoul.sql` = OSM Overpass 실경로 **16산 42코스**(seed.sql 패턴 준수). 재실행 ETL `supabase/etl/`(validate 6/6). `etl/data/`는 gitignore.
- **기능(P0, 신규 네이티브 의존성 0)**: 네비식 코스 선택(index.tsx: selectedCourseId/카메라 fit/양방향 시트/해제 제스처, colored.ts lineStyle emphasis+glow), 산 탐색(`GET /mountains`+search.tsx 모달), 내 위치 버튼, 기록→지도 점프(focus 파라미터 계약).
- **디자인**: theme.ts 다크(Deep Granite+Summit Green+MONO, 토큰명 호환), 지도 Navi 야간모드, Okabe-Ito hue 유지 밝기 리프트. capture 성공 모먼트만 그림자.
- **검증 그린**: mobile tsc 0 / 단위 8 / api 3 / seed validate 6. code-reviewer BLOCKER·HIGH 0, MEDIUM(재탭 무동작)·LOW(preselect 폴백) 수정 완료.
- 스펙 문서: `scratchpad/plan-pm.md` · `design-spec.md` · `data-report.md`.

## 시드 DB 적용 완료 (2026-07-06)
seed_seoul.sql을 프로덕션 Supabase에 적용 → **mountains 19 / courses 50**(기존 3산8코스 + 서울 16산42코스). `/v1/courses` 200·50코스 확인. 앱 지도에 서울 산 렌더 확인.

## 패스 1 런타임 검증 완료 (2026-07-06, /polish 1)
iOS 시뮬(D361BEDF) 딥링크+위치위조+스샷으로 다크 전환·신기능 눈검증. 스샷 `scratchpad/p1-*.png`.
- **통과**: 다크 지도(Navi 야간모드)+서울 산 마커+회색 코스선+검색 pill+탭바 초록 액티브 / 검색 모달 다크 / 기록 탭 다크(히어로 MONO·완등카드·지도점프 힌트) / 캡처 select_course 다크(+preselect 폴백: 가짜 courseId→nearest 강조 정상) / **완등 성공(captured) 다크 프리미엄 — successSoft 헤일로+그린 글로우 "floating trophy"+"1좌 완등" MONO 칩, 감정 핵심 살아있음** / 거리밖 거절 다크 절제모드(8.3km, 판정 정상).
- **런타임에서 찾아 고침**: `search.test.js`가 `src/app/`에 있어 expo-router가 라우트로 로드→`node:test` 미해결로 **앱 전체 크래시**(tsc/node테스트로 안 잡히고 런타임에서만 드러남). → `src/lib/search.test.js`로 이동. **app 디렉토리엔 .test/.spec 두지 말 것**(colored.test.js는 lib라 안전).

## Fly 재배포 완료 (2026-07-06)
`GET /v1/mountains` 배포 → 200·19산·courseCount 숫자. 헬스체크 200, 프로덕션 스모크 **18/18**(courses bbox 체크를 고정값 8→하한 `>=8`으로 수정: 시드 확충 반영). 스모크 테스트 데이터 정리(climbs 12·users 3 삭제). **앱 검색 화면 데이터 렌더 확인**(지역 그룹+고도+코스수, `scratchpad/p1-08-search-ok.png`). 검색 블로커 해소 → 패스1 종료.

## 코스 표현 "네비화" 완료 (2026-07-07, 사용자 요청)
- **코스선 초록 통일** — 난이도별 색(파랑/주황) → 전부 초록. 상태는 색이 아니라 형태로(미완등=초록 실선 w4 / 진행중=점선 / 완등=굵은 실선 w6+글로우). 색약 안전(05 §3.1)은 시트 난이도 뱃지(dot+텍스트)가 담당 — 지도선은 색 단독 인코딩 아님(형태 인코딩). `colored.ts` UNCLIMBED_COLOR `#2ECC71D9`, lineStyle에서 TRAIL_GREEN 통일(difficulty 파라미터 미사용=`_difficulty`).
- **예상 소요시간·거리 라벨** — 코스선 중앙에 `⏱ 90분 · 2.6km` caption 마커(핀 없이 텍스트만: width/height 1 + image 생략). `isHideCollidedCaptions`로 겹침 자동 숨김, 선택 모드에선 선택 코스만, onTap=selectCourse(라인 탭 가로채기 대비). `index.tsx` durationLabel 헬퍼.
- 시뮬 검증 `scratchpad/p1-13-green.png`(청계산 원터골 완등 밝은초록/옛골 미완등 초록 + 두 라벨). **데이터 추가 불필요** — OSM 실경로(코스당 11~82점)+duration_min 기존 데이터로 충족.

## 지도 상호작용 재설계 + 등반 세션 (2026-07-07, 사용자 요청 · 커밋 33a2e7c 인프라 / 6200ad2 지도)
사용자 피드백 2건.
- **"산을 탭해야 코스가 보이게"(줌 무관 선택)** — 줌 히스테리시스(`showLines`/`LINE_ZOOM_IN/OUT`) 제거. 산 마커는 줌 무관 **항상 표시**(전엔 저줌에만), 코스선은 `selectedMountainId`의 것만 노출(+진행 중 등반 코스는 다른 산이라도 유지). 저줌/고줌 어디서든 산 탭→코스. 시트 close = 산 선택 해제(코스선 숨김; 캐시는 react-query가 보존). `index.tsx` `visibleCourses`/`emphasisFor`.
- **등반 시작→진행→완등 인증 "사이 프로세스"** — 전엔 인증하기 누르면 체크포인트 멀다고 막다른 실패. 이제 코스 골라 시트 CTA **"○○ 등반 시작"** → 상단 **등반 중 배너**(🥾 코스명 + 경과시간 MONO + `완등 인증` 버튼 + `✕` 종료, success 좌보더). 이미 진행 중인 코스면 CTA가 `완등 인증하기`로 전환. 완등 인증은 **기존 GPS 한 점 판정 그대로 재사용** — "멀다"는 이제 세션 안의 "계속 올라가세요" 피드백(막다른 실패 아님). 인증 성공 시 `capture.tsx` chooseCourse에서 `clearHike`.
- **저장**: `active_hike` SQLite 단일행(id=1) — `outbox.ts` startHike/getActiveHike/clearHike/subscribeHike, `colored.ts` `useActiveHike` 훅(SSOT). 앱 재시작 넘겨 지속. **백그라운드 추적 없음 유지**(세션 플래그일 뿐, 위치는 인증 순간 1점 — 02 최상위 프라이버시 결정 준수).
- **검증**: tsc 0 / 단위 8 / dangling(showLines·LINE_ZOOM) 0. iOS 시뮬(D361BEDF) 눈검증 — 마커 상시 표시(`p2-03`), 산 탭시 초록선+시트+"등반 시작" CTA(`p2-04`), 등반 중 배너 "등반 중·23분째"(`p2-06`, active_hike 직접 seed 후 relaunch로 실증 — cliclick 접근성 막혀 탭 대신 DB seed, 실제 startHike 배선은 동일). 스샷 `scratchpad/p2-0*.png`.

## 등반 배너 실시간 거리 + 진행 코스 네비 강조 (2026-07-07, 사용자 요청 · 커밋 e391341)
- **정상까지 실시간 거리 + 예상 소요시간(ETA)** — 배너에 `정상 NNNm · 약 NN분`(1km↑는 km). ETA=코스 페이스(durationMin/distanceM)×남은 직선거리(커밋 e0c9d8f, 직선이라 '약'; 페이스 없으면 거리만). 메트릭 있을 땐 '등반 중' 접두 생략(한 줄 유지). `index.tsx` `watchPositionAsync`(Balanced, 20m/5s) 포그라운드 폴링, `getCachedCourses`에서 체크포인트 좌표(등반 시작 전 openMountain이 캐시하고 course_cache는 durable). **이미 권한 허용된 경우만**(getForegroundPermissionsAsync==granted) — 콜드 프롬프트 없음(05 §3), **백그라운드 추적 없음**(앱 백그라운드 시 iOS가 watch 자동 중단). 반경 안이면 `정상 도착 ✓` + 완등 인증 버튼에 밝은 링(`hikeCertifyArrived`).
- **진행 코스 네비 강조** — `colored.ts` Emphasis에 `'active'` 추가: 풀 초록 실선 w8 + 강한 글로우(35%), 완등/미완등/점선 무관하게 압도. `emphasisFor`가 진행 중 코스에 'active' 반환(전엔 selected).
- **내 위치 큰 내비 화살표(커밋 476feb0)** — 작은 파란 점(locationOverlay) 대신 40dp 초록 화살표(`assets/images/nav-arrow.png`, Pillow 생성, 흰 외곽선 다크맵 대비) 마커. `angle=heading`으로 이동 방향 회전(정지 시 위쪽), 중앙 앵커. myPos에 heading 저장.
- **v0 3산 코스 실경로 교체(커밋 a36212e)** — 청계산·북한산·관악산이 v0 5점 근사 직선 → 실제 OSM 등산로. `supabase/etl/rebuild_v0.mjs`: Overpass 등산로 way 수집→그래프→각 코스(목표봉 최근접 소스 Dijkstra, 들머리 최근접 도달노드) 최단경로. **코스 id·이름·checkpoint·난이도·소요시간 보존, path·distance_m만 갱신** → climbs FK·기록 안전. 프로덕션 8코스 UPDATE 적용(사용자 승인, `pg` 드라이버+api/.env, 트랜잭션), `seed.sql` 동기화(재시딩 일관). 검증 `p2-18`(원터골 실제 갈지자 경로, 3.6km). **주의: checkpoint는 원래부터 실제 정상에 정확했음**(청계산=매봉 583m, 망경대 618m는 통제구역) — "정상이 남쪽에 보임"은 지형(들머리 북쪽→정상 남하)이지 버그 아님. 들머리 snap 일부 큼(산성 626m) — 실트레일 시작점 근사, v0 허용.
- **내 위치 + 정상 목표 + 오토핏(커밋 ef93328)** — 등반 중: ①native `locationOverlay`(내 위치 파란 점, watch 위치 feed) ②정상 목표 마커 `🚩 정상 NNNm`(캡션만, 목표 지점에 남은 거리; GPS 전엔 '🚩 정상') ③등반 시작 시 내 위치↔정상 1회 카메라 오토핏(`fittedHikeRef`, 등반당 1회 후 사용자 조작 존중). 등반 시작이 명시적 위치 액션이라 그 시점 `requestForegroundPermissionsAsync`(콜드 아님) → `locGranted` state로 watch 재가동. 등반 중인 산 집약 마커는 정상 마커로 대체(캡션 겹침 방지). 검증 `p2-12`(겹침)→`p2-13`(수정): 파란 점+🚩 정상 701m+오토핏(100m 스케일).
- **검증**: tsc 0 / 단위 8. 시뮬 눈검증(active_hike seed + `simctl privacy grant location` + `simctl location set`) — 정상 600m(`p2-07`), active 라인 굵은 글로우+CTA '완등 인증하기'(`p2-08`), 정상 도착 ✓+버튼 링(`p2-09`). cliclick 탭 불가는 동일 — 상태는 DB seed+위치위조로 실증.

## 다음 할 것 (우선순위)
1. **실기기(real device) 런타임 검증 — 유일한 실질 잔여**. 시뮬로 원리상 못 보는 것: 햅틱 체감(Taptic), 완등 성공 reanimated 진입 애니 120fps 스무스니스·프레임드랍(스샷은 정착 상태만), 소형기기(SE) `captured` 히어로+2CTA 세로 여유, pending 점선·줌11.5 마커전환·바텀시트 스프링(ProMotion/제스처 필요). **특히 등반 세션 전체 흐름(등반 시작→실시간 거리 배너→내 위치 화살표→'내 위치로' FAB→완등 인증)을 실기기 GPS로 처음부터 끝까지** — 지금까지 전부 `simctl location` 위조로만 검증. EAS 실기기 iOS 프로필(`device`)은 커밋 cd223ba로 준비됨.
2. **login/signup 다크 눈검증** — 코드·tsc 통과, 로그아웃 사이클 번거로워 생략됨. 재로그인 시 확인. 사소.
3. **보류(재빌드/외부의존 필요)**: 저줌 마커 진짜 pill 형태(커스텀 PNG + dev client 재빌드) / Sentry(rank9, DSN+재빌드 → 블록) / DB `sslmode=verify-full`(rank13, CA 번들 — 문서화 권고로 종결) / throttle(rank18, 문서화로 종결).
- `.mcp.json`은 커밋 제외(세션 시작부터 로컬 변경, 작업 무관).

---

# 핸드오프 — 2026-07-03

## 지금 상태
- **백엔드**: https://hiking-api-v0.fly.dev — **JWT 로테이션 + 백엔드 픽스 재배포 진행/완료**(JWT 부팅가드·500 좌표 스크럽·me/climbs verified 필터). 새 JWT_SECRET(48자)로 로테이션됨 → 기존 앱 세션은 재로그인 필요.
- **앱(iOS 시뮬레이터)**: 실행+지도 렌더+가입/로그인 검증 통과. worklets 크래시 수정(patch-package 영속). 시뮬 id D361BEDF, EAS 빌드 b5ad344b.
- **커밋(브랜치 claude/hiking-app-planning-19khzn, 로컬 — push 필요)**:
  - f421006 폴더 총정리 + worklets 패치 + .claude 전체
  - b3f4175 autoFixable 스펙 컨포먼스(팔레트/뱃지/터치타깃/대비/JWT가드/좌표스크럽/verified필터)
  - af26d5c 캡처 데이터-유실(rank1) + 적대적 검증 하드닝
  - 80cea0a 인증 성공 시퀀스 + 위치 권한 프라이밍 (rank6/rank14) — capture.tsx, expo-haptics 추가
  - a61a6cd 코스 선 상태별 렌더 + 지도 톤다운 + 저줌 산 마커 (rank5/16/10) — index.tsx, colored.ts
  - 2ad5f11 빈 상태 시작 코스 추천 카드 (rank15)
  - a432e60 미완등 코스선 가독성 (rank5 런타임 폴리시)
  - ad6df0c 디자인 비평 반영 (용어 통일·거리 포맷·대비·null 카피·top-void)
  - **[Pass 2 디자인 100x]** 3e07412 UI 토큰 모듈(theme.ts) / 2e529cf 완등 성공 시퀀스 프리미엄화(capture) / 8dd60dc 지도 마커·추천카드·바텀시트 + 시트 CTA 탭바 클리어런스(index/colored) / ab67b38 기록 스탯 히어로화 + 인증됨 칩(records) / 652587e HANDOFF
  - **push 완료** (2026-07-03): origin/claude/hiking-app-planning-19khzn = 652587e (17커밋 발행). 이제 로컬=원격 동기.

## 캡처 아웃박스 계약 (rank1 이후 — 건드리기 전 필독)
- insertCapture(state='awaiting_course', courseId=null) = 판정 통과 즉시 durable = 성공 시점(04 §4.1).
- awaiting_course는 flush 제외(코스 선택 창 조기 제출 레이스 차단). 코스선택→attachCourse(queued) / 나중에·닫기·언마운트→finalizeCapture(queued).
- 콜드스타트(wireOutbox)는 awaiting_course + uploading 모두 queued 재큐(멱등 서버라 replay 안전).
- 이탈 경로 finalize는 pendingRef+언마운트 이펙트가 단일 보장. start()는 runningRef 재진입 가드. flush POST 20s abort 타임아웃.

## Pass 1 (런타임 검증 + 디자인 마감) 완료 — 2026-07-03 (/polish 1)
iOS 시뮬(test1234 로그인)에서 딥링크(`mobile:///capture?mountainId=`)+위치위조(`simctl location`)+`simctl privacy` 권한제어+스크린샷으로 전 화면 눈 검증. 스샷 = `scratchpad/polish-*.png`. 코스 선택 탭만 사용자 직접(idb 없음/접근성 막힘).
- **런타임 검증 통과**: 빈상태 추천카드(rank15)·권한 프라이밍(rank14)·select_course·거리밖 거절(15.2km)·**captured 성공(🎉 + "지금까지 N좌 완등" 카운터 + 기록보기 CTA, rank6)**·지도 톤다운(rank16)·코스선(미완등 회색 / **verified 초록 굵은 실선** 실증 / pending 점선은 코드검증)·저줌 산마커(완등 ✓ 초록 / 미완등 회색, rank10)·기록 탭(완등 카운터/리스트).
- **런타임에서 찾아 고침**: ①추천카드가 플로팅 NativeTabs에 겹침 → safe-area+`TABBAR_CLEARANCE`(2ad5f11). ②미완등 코스선 `#9E9E9E66 w2`가 톤다운 지도서 안 보임 → `#8A8A8ACC w3`(a432e60). ③디자인 5렌즈 비평(워크플로) pass-1(ad6df0c): 용어 '정복'→'완등' 통일(CLAUDE.md 불변식 위반이었음), 거리 km 포맷(fmtDist), 기록 카운터 대비/위계, null 완등 카피 '위치 인증 완료', 모달 top-void 상향 앵커.
- **반려**: "난이도 파랑→앰버" 제안은 Okabe-Ito 색약안전(05 §3.1, moderate=파랑 의도) 위반이라 유지.
- **햅틱**: iOS 시뮬은 Taptic 무지원이라 미검증. 코드 정확 + `.catch` 가드 → **실기기에서만 확인 가능**. (재빌드 불필요 판단.)
- **테스트 정리**: test1234 완등 8건(자동테스트 아티팩트, courseId=null 6 + 옛골/서울대입구 2) DB 삭제 완료 — 계정 빈 상태.

## Pass 2 (디자인 100x) 완료 — 2026-07-03 (/polish 2)
병렬 백그라운드 에이전트 3(파일 소유권 분할: capture / index+colored / records, 공용 `src/lib/theme.ts` 토큰 SSOT를 먼저 깔고 각자 import)로 표현 계층만 다듬음. 판정·아웃박스·에러봉투·쿼리·Okabe-Ito 팔레트 불변, 신규 네이티브 의존성 0(reanimated/haptics는 babel-preset-expo 57 자동 링크). 시뮬 눈 검증 = `scratchpad/p2-*.png` 9장.
- **감정 피크(최우선) ✓**: captured에 successSoft 헤일로+success 원판+흰 ✓ 엠블럼, reanimated 페이드+스케일 진입 + 체크 스프링 팝, "N좌 완등" 성공 그린 pill 칩. select_course 좌측정렬 헤더 + nearest brandSoft 카드 + '가장 가까움' 브랜드 pill.
- **저줌 마커 ✓(부분)**: `mountainMarkerStyle` SSOT, 캡션 `haloColor` 흰 외곽선으로 basemap 위 가독. 정복 green✓/미완등 gray 색+아이콘+텍스트 이중인코딩. **한계**: @mj-studio naver-map 2.9 캡션엔 pill/배경 prop 없음(halo가 유일). 진짜 pill/커스텀 형태는 PNG 에셋+네이티브 재빌드 필요 → 보류.
- **기록 스탯 히어로 ✓**: brandSoft 히어로 카드(완등한 산 52px tabular-nums 주인공), 완등 카드 3-tier + '인증됨' 성공 칩(코스/‌null코스/‌재인증 3변형 검증).
- **토큰 통일 ✓**: theme.ts(C/R/SP/CTA_H). CTA 파랑 #208AEF→#0A66C2 딥블루로 수렴.
- **타이포/카피 ✓**: 위계 700/600/500/400, priming '딱 한 번', 추천카드 '탭해서' 제거, oor 거리별 분기.
- **런타임 결함 수정**: 바텀시트 '정상에서 인증하기' CTA가 플로팅 NativeTabs에 가려짐 → 시트 contentContainerStyle paddingBottom 탭바 클리어런스(8dd60dc). 마커 캡션 '미정복'→'미완등' 회귀 수정(에이전트 도입 → 되돌림).
- **검증 방식**: 탭 자동화 없음(idb 없음/접근성 막힘) → 탭-게이트 화면(captured/바텀시트/저줌마커)은 **throwaway 강제-상태 편집→스크린샷→즉시 복구**로 자율 검증. captured 카운터/records 카드용 쇼케이스 완등은 Supabase execute_sql로 삽입 후 삭제(계정 클린).
- **미검증(실기기 전용)**: 햅틱 체감, reanimated 진입 애니의 실제 부드러움(스샷은 정착 상태만), 소형기기(SE)에서 captured 히어로+2CTA 세로 여유.

## 다음 할 것
### /polish 2 잔여 (대부분 위 Pass 2에서 착지 — 남은 것만)
- **전환/모션 감사**: captured 진입 애니 **구조 감사 완료(코드 리뷰)** — opacity 0→1+scale 0.94→1(팝-인/레이아웃시프트 없음), 엠블럼 스프링 ζ≈0.50(약 6% 오버슈트, 축하에 적절), 90ms 스태거+햅틱 동반. 구조적 결함 없음. **남은 건 device-only**: 실기기 120fps 스무스니스/프레임드랍/햅틱 체감, pending 점선 대시·줌 11.5 경계 마커전환 페이드·바텀시트 스프링은 제스처/ProMotion 필요(시뮬 소프트렌더러로는 측정 대상 아님, ffmpeg도 없음).
- **저줌 마커 진짜 pill/커스텀 형태**: 현재 halo가 상한(lib 캡션 한계). pill 배경/채운-vs-아웃라인 형태 이중코딩은 커스텀 PNG 에셋 + dev client 재빌드가 있어야 가능 → 별도 작업으로.
- **소형기기(SE) captured 세로 여유** 확인(히어로+칩+2CTA), **탭 비활성 tint** NativeTabs 네이티브라 JS로 미적용(필요 시 네이티브 설정).
### 백엔드/인프라 (미적용)
- **rank9 Sentry**(DSN 필요·네이티브 재빌드 → 블록) / **rank13 DB sslmode verify-full**(CA 번들·verify 없이 바꾸면 Fly 끊김 → 문서화 권고) / **rank18 throttle**(api-design 'IP 기준' 확정 → 문서화로 종결).

## 검증/재현
```bash
# iOS 시뮬 재현
xcrun simctl boot "iPhone 17 Pro"; open -a Simulator
cd mobile && npx eas-cli build:run -p ios --id b5ad344b-051a-4eeb-b241-f729fb80f6ea
npx expo start --dev-client
xcrun simctl openurl booted "mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
# 캡처 위저드는 시뮬 Features>Location으로 체크포인트 좌표 위조해 완등까지 테스트
# 백엔드 스모크: /smoke-test 스킬 또는 API_BASE=https://hiking-api-v0.fly.dev node api/scripts/smoke.mjs
```
안드로이드 병행 APK: https://expo.dev/artifacts/eas/fsRdT830zH4ZLdN0K2YlO2UIoiLyvP8VVA209zRO3UI.apk (빌드 007ec52c)
