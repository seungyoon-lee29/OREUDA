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

## 다음 할 것 (우선순위)
1. **미눈검증(코드 신뢰)**: login/signup 다크(FE-C 적용+tsc 통과, 로그아웃 사이클 번거로워 생략) — 재로그인 시 확인.
2. **패스2(디자인 100x) 후보**: 초록 checkpoint 마커가 미완등에도 초록 기본핀이라 "완등" 오해 소지(미완등=중립색/verified만 초록으로 이중인코딩 강화). 우상단 톱니는 expo-dev-client 오버레이(프로덕션 없음, 무관).
3. `.mcp.json`은 커밋 제외(세션 시작부터 로컬 변경, 작업 무관).

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
