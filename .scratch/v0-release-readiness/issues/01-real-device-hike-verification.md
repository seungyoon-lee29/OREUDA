# 01 - 실기기 등반 세션 런타임 검증

Type: verification
Status: open
Triage: ready-for-human
Depends on: None
Blocked by: EAS `device` 프로필 iOS 빌드 설치(커밋 cd223ba로 준비됨, 사용자 실행)
Owner: unclaimed
Claimed at: -
Last heartbeat: -

## Objective

실기기(physical iOS) 실 GPS로 등반 세션 전 흐름을 처음부터 끝까지 검증한다. 지금까지 전부 `simctl location` 위조로만 검증됐고, 시뮬레이터가 원리상 못 보는 것들을 실기기에서 눈으로 확인한다.

## Owned scope

- `mobile/` 런타임 동작 검증(코드 변경 아님 — 결함 발견 시 별도 티켓/수정).
- 검증 증거(스샷·메모)를 이 티켓과 `HANDOFF.md`에 기록.

## Requirements

- EAS `device` 프로필 빌드를 실기기에 설치(사용자). dev client로 `npx expo start`.
- 실제 GPS로 등반 시작 → 실시간 정상 거리 배너 → 내 위치 화살표 → '내 위치로' FAB → 완등 인증까지 완주.
- 완등 성공 reanimated 진입 애니 스무스니스/프레임드랍, 햅틱(Taptic) 체감, 소형기기(SE) `captured` 히어로+2CTA 세로 여유, pending 점선·줌11.5 마커 전환·바텀시트 스프링 확인.
- login/signup 다크 화면 눈검증(재로그인 사이클에서 함께).

## Interface contract

- 판정·아웃박스·에러 봉투·Okabe-Ito 팔레트 등 기존 계약 불변. 검증만 하고, 수정이 필요하면 발견 사항을 기록 후 별도 결정.
- 백그라운드 위치 추적 없음(02 최상위 프라이버시 결정) 준수 확인.

## Acceptance criteria

- 실기기 실 GPS로 등반 시작→완등 인증 전 흐름 크래시 0으로 완주.
- 애니 스무스니스·햅틱·소형기기 레이아웃을 실기기에서 확인(관찰 결과 기록).
- 백엔드 스모크 `/smoke-test` 통과 유지 + 테스트 데이터 정리.

## Out of scope

- 재빌드/외부 의존 항목(Sentry·sslmode verify-full·throttle·커스텀 마커 pill) — 문서화로 종결.
