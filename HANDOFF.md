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

## 다음 할 것
### /polish 2 (디자인 100x) 백로그 — 5렌즈 비평의 pass-2 항목
- **감정 피크 승격(최우선)**: select_course/captured를 성공 축하 톤으로 — 히어로 배경/그라데이션, 진입 스케일업+햅틱, 브랜드 컬러. 완등 성공이 앱의 유일한 자랑 순간인데 지금은 라디오 폼처럼 밋밋.
- **저줌 산마커 재디자인**: 완등=채운 브랜드색+체크 / 미완등=회색 아웃라인(색+형태 이중), 라벨 흰 halo/pill(basemap 라벨과 충돌), 현재위치 마커와 형태 분리(현재 둘 다 초록 물방울).
- **기록 스탯 히어로화** + 완등 카드 색 accent/체크뱃지, '인증됨' 성공 그린 칩.
- **토큰 통일**: CTA 규격(풀폭/높이/파랑 #0A66C2), 카드 radius(16), 탭 비활성 tint(#8E8E93), 보조텍스트 회색.
- **타이포**: 코스행 위계 700/500/400, priming lineHeight 1.45, tabular-nums.
- **카피**: priming '1점'→'딱 한 번', 추천카드 '탭해서' 제거, 거리밖 거리별 분기 카피.
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
