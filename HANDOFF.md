# 핸드오프 — 2026-07-03

## 지금 상태
- **백엔드**: https://hiking-api-v0.fly.dev — **JWT 로테이션 + 백엔드 픽스 재배포 진행/완료**(JWT 부팅가드·500 좌표 스크럽·me/climbs verified 필터). 새 JWT_SECRET(48자)로 로테이션됨 → 기존 앱 세션은 재로그인 필요.
- **앱(iOS 시뮬레이터)**: 실행+지도 렌더+가입/로그인 검증 통과. worklets 크래시 수정(patch-package 영속). 시뮬 id D361BEDF, EAS 빌드 b5ad344b.
- **커밋(브랜치 claude/hiking-app-planning-19khzn, 로컬 — push 필요)**:
  - f421006 폴더 총정리 + worklets 패치 + .claude 전체
  - b3f4175 autoFixable 스펙 컨포먼스(팔레트/뱃지/터치타깃/대비/JWT가드/좌표스크럽/verified필터)
  - af26d5c 캡처 데이터-유실(rank1) + 적대적 검증 하드닝

## 캡처 아웃박스 계약 (rank1 이후 — 건드리기 전 필독)
- insertCapture(state='awaiting_course', courseId=null) = 판정 통과 즉시 durable = 성공 시점(04 §4.1).
- awaiting_course는 flush 제외(코스 선택 창 조기 제출 레이스 차단). 코스선택→attachCourse(queued) / 나중에·닫기·언마운트→finalizeCapture(queued).
- 콜드스타트(wireOutbox)는 awaiting_course + uploading 모두 queued 재큐(멱등 서버라 replay 안전).
- 이탈 경로 finalize는 pendingRef+언마운트 이펙트가 단일 보장. start()는 runningRef 재진입 가드. flush POST 20s abort 타임아웃.

## 다음 할 것 (감사 후속, 우선순위 — 이제 앱이 도니 시뮬로 런타임 검증 가능)
1. **rank6 인증 성공 시퀀스** — captured 진입 시 Haptics.notificationAsync(Success) + '나의 N번째 산' 카운터(me/climbs totalMountains) + CTA '기록 보기'(→/records). 대부분 코드, 햅틱만 실기. rank1 새 플로우와 직결.
2. **rank5 코스 선 상태별 렌더** — 미완등(난이도색 저불투명·가늘게)/pending(+흰케이싱+시계뱃지)/verified(굵게) 구별. colored.ts lineColor 상태분기 + index.tsx. 지도 실기 검증.
3. **rank16 지도 스타일** — 홈 Basic+톤다운 / 상세 Terrain, 위성·산악레이어 off. 저채도 배경이 색칠 대비 뒷받침.
4. **rank10 저줌 정복 마커/클러스터** — 저줌에서 체크포인트 숨기고 산 단위 마커(미정복 아웃라인/정복 채움+체크), NaverMapView clusters prop.
5. **rank14 권한 프라이밍** / **rank15 빈상태 추천카드** / **rank9 Sentry(+좌표 스크럽, 네이티브 재빌드)** / **rank13 DB sslmode verify-full** / **rank18 throttle ip+email(or 문서화)**.

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
