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

## 캡처 아웃박스 계약 (rank1 이후 — 건드리기 전 필독)
- insertCapture(state='awaiting_course', courseId=null) = 판정 통과 즉시 durable = 성공 시점(04 §4.1).
- awaiting_course는 flush 제외(코스 선택 창 조기 제출 레이스 차단). 코스선택→attachCourse(queued) / 나중에·닫기·언마운트→finalizeCapture(queued).
- 콜드스타트(wireOutbox)는 awaiting_course + uploading 모두 queued 재큐(멱등 서버라 replay 안전).
- 이탈 경로 finalize는 pendingRef+언마운트 이펙트가 단일 보장. start()는 runningRef 재진입 가드. flush POST 20s abort 타임아웃.

## 방금 착지 (rank6/14/5/16/10 — 병렬 에이전트 2, tsc+lint 클린, 커밋 80cea0a·a61a6cd)
런타임 눈 검증만 남음(코드는 완료). 시뮬에서 확인할 것:
- **햅틱**: dev-client **재빌드 필요**(expo-haptics 네이티브). 현재 빌드는 무해히 skip. 재빌드 후 captured 진입 시 성공 진동 확인.
- **권한 프라이밍**: 앱 위치권한 초기화 후 진입 → priming 화면 → '위치 허용하고 인증' → OS 프롬프트 흐름.
- **카운터/CTA**: 완등 기록 있는 계정에서 '지금까지 N좌' 표시 + '기록 보기'→records 탭.
- **선 3상태**: verified 굵은 실선 / pending 점선[12,8] / unclimbed 회색 가는선 구분(색+굵기+패턴).
- **톤다운**: lightness -0.15 + 레이어 off가 과/약하지 않은지, Okabe-Ito 대비. 대시 간격 iOS/Android 튜닝 여지.
- **저줌 산 마커**: 줌 히스테리시스 경계(z11.5/10.5)에서 checkpoint↔산마커 전환, centroid 위치 자연스러운지, 정복 green+✓ / 미정복 gray.

## 다음 할 것 (남은 감사 후속)
1. **rank15 빈상태 추천카드** — index.tsx 바텀시트/빈 지도 상태에 추천 코스 카드. (index.tsx라 위 지도 커밋과 같은 파일 — 이어서.)
2. **rank9 Sentry** — DSN 필요(사용자 제공) + 네이티브 재빌드. 좌표 스크럽 beforeSend 포함. **블록**.
3. **rank13 DB sslmode verify-full** — Supabase CA 번들 필요, verify 없이 바꾸면 Fly 연결 끊김 → ADR/문서화 우선 권고(즉시 적용 리스크).
4. **rank18 throttle** — api-design 규칙이 'IP 기준'으로 확정(Fly trust proxy) + 감사 LOW → **문서화로 종결**(코드 변경 안 함).

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
