# 핸드오프 — 2026-07-03

## 지금 상태
- 백엔드: **https://hiking-api-v0.fly.dev** 배포+스모크 통과
- 앱: **iOS 시뮬레이터 전체 검증 통과 ✅** — 가입·로그인(백엔드 연결) + 네이버 지도 렌더(NCP 키 3mohcujert) 확인. RN/expo-router/gesture-handler 정상.
- 남은 스팟체크(선택): 코스 폴리라인 8개 / 산 마커 바텀시트 / 인증 위저드(Features>Location 위치 위조) / 오프라인 캐시
- 폴더 구조 총정리 완료: 이중 중첩 제거(api/mobile/docs/supabase 루트로), 루트 CLAUDE.md + .claude/ 전체 메뉴(rules/skills/commands/agents/hooks/output-styles) 실내용으로 채움, .mcp.json/.gitignore/.worktreeinclude 추가.
- **미커밋** — 아래 "커밋" 참고.

## 오늘 고친 핵심 버그 (worklets 크래시)
앱이 실행 자체가 안 됐던 원인: `react-native-worklets` 0.10.0 JS가 `__DEV__`에서 static feature flag `ENABLE_CROSS_RUNTIME_STACK_TRACES`를 네이티브에 조회하는데, RN 0.86의 Hermes(V1)가 이 플래그를 몰라 throw → 앱 전체 크래시(로그엔 엉뚱하게 "ErrorBoundary of undefined"로 표시).
- 수정: `getStaticFeatureFlag`가 네이티브 throw 시 false로 폴백. 이 기능은 dev 스택트레이스 캡처용이라 꺼도 무해.
- 영속화: `patches/react-native-worklets+0.10.0.patch` + package.json `postinstall: patch-package`. **재빌드 불필요**(JS 패치라 metro가 서빙).

## iOS 시뮬레이터 재현 (Mac에서)
```bash
xcrun simctl boot "iPhone 17 Pro"        # 이미 생성됨 (id D361BEDF...)
open -a Simulator
cd mobile && npx eas-cli build:run -p ios --id b5ad344b-051a-4eeb-b241-f729fb80f6ea  # 시뮬 설치+실행
npx expo start --dev-client              # metro
xcrun simctl openurl booted "mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```
EAS iOS 시뮬레이터 빌드: b5ad344b (development, ios.simulator=true, Apple 계정 불필요).

## 남은 검증 (로그인 통과 후 — 터치 필요)
시뮬레이터 UI 자동화는 macOS 접근성 권한이 없어 막힘. 사용자가 직접 탭하거나, 터미널에 접근성 권한을 주면 자동화 가능.
1. 가입(아무 이메일, 비번 8자+) → 지도 이동
2. **지도 렌더** = NCP 키(3mohcujert) OK. 회색이면 NCP 콘솔에 iOS Bundle ID `com.anonymous.mobile` 등록 확인
3. 코스 폴리라인 8개 / 산 마커 탭 → 바텀시트 / 인증 위저드(시뮬은 Features>Location으로 위치 위조) / 오프라인 캐시

## 안드로이드 (병행)
APK: https://expo.dev/artifacts/eas/fsRdT830zH4ZLdN0K2YlO2UIoiLyvP8VVA209zRO3UI.apk (빌드 007ec52c). 폰 설치 후 `npx expo start` 연결.

## 커밋
79개 rename(플래튼) + 신규 .claude/CLAUDE.md/patch/스모크스크립트. 사용자 확인 후 커밋 예정.
