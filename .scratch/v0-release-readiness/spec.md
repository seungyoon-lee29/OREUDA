# 등산 완등 인증 앱 (Hiking App) — v0 릴리스 레디니스 Specification

## Problem

백엔드·DB·앱 코드는 완성됐고 프로덕션 배포(Fly)와 E2E 스모크(18/18)까지 통과했다.
그러나 앱 런타임은 **지금까지 전부 iOS 시뮬레이터 + `simctl location` 위치 위조로만** 검증됐다.
시뮬레이터가 원리상 재현하지 못하는 것들이 미검증으로 남아 있다:

- 실제 GPS로 등반 세션 전 흐름(등반 시작 → 실시간 정상 거리 배너 → 내 위치 화살표 → '내 위치로' FAB → 완등 인증)을 처음부터 끝까지
- 햅틱 체감(Taptic), 완등 성공 reanimated 진입 애니의 120fps 스무스니스·프레임드랍
- 소형기기(SE)에서 `captured` 히어로 + 2 CTA 세로 여유
- pending 점선·줌11.5 마커 전환·바텀시트 스프링(ProMotion/제스처 필요)

## Destination

실기기(physical iOS) 실 GPS에서 등반 세션 전 흐름이 검증되어 v0를 릴리스 가능한 상태.
관찰 가능한 종료 상태: 실기기에서 등반 시작 → 완등 인증까지 크래시 없이 완주하고, 위 미검증 항목이 눈으로 확인된다.

## Scope

- 실기기 iOS 런타임 검증(EAS `device` 프로필 빌드는 커밋 cd223ba로 준비됨).
- login/signup 다크 눈검증(코드·tsc 통과, 로그아웃 사이클 번거로워 생략됐던 것).

## Acceptance

- 실기기에서 등반 시작→실시간 거리 배너→내 위치 화살표→FAB→완등 인증 전 흐름을 실 GPS로 완주(크래시 0).
- 완등 성공 애니 스무스니스·햅틱 체감·소형기기 레이아웃을 실기기에서 눈으로 확인.
- 백엔드 스모크 `/smoke-test` 통과 유지, 테스트 데이터 정리.

## Out of scope

- 재빌드/외부 의존이 필요해 문서화로 종결된 항목: Sentry(rank9), DB `sslmode=verify-full`(rank13), throttle(rank18), 저줌 마커 커스텀 PNG pill.
