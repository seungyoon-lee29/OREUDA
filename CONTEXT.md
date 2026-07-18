# 등산 완등 인증 앱 (Hiking App) Context

확정된 도메인 용어만 기록한다. UI 문구·코드 식별자·문서는 이 어휘를 따른다.

## Terms

**오르다**: 제품명(번들 `com.seungyoonlee.orda`). 저장소명은 hiking-app.

**완등**: 코스 체크포인트 도착 인증이 수락된 상태. 지도 채색·기록·"N좌" 카운터의 단위. _Avoid_: 정복·미정복(Pass 1에서 UI 전수 교체된 금칙어), 등정.

**인증(캡처)**: GPS **한 점**으로 완등을 판정·기록하는 행위. 위치는 인증 순간 1점뿐 — 백그라운드 추적 없음(문서 02 최상위 프라이버시 결정).

**판정(lenient)**: 인증 수락/거절 결정. 거절 사유는 `capturedAt` 유효성과 하루 중복뿐 — 거리/속도/mock 이상은 거절이 아니라 **flag**(문서 03).

**flag**: 판정을 통과시키되 기록하는 이상 신호(`flags[]`). leaderboardEligible 같은 파생 판단에만 영향.

**replay**: 같은 `client_ref` 재전송에 200 + 기존 결과 반환(멱등). 신규 생성이 아니다.

**하루 중복**: 같은 유저·코스·KST 날짜의 2번째 완등 — `uq_climbs_daily`로 거절 + `existingClimbId` 반환.

**체크포인트**: 코스의 인증 지점. 실제 정상 좌표에 정확(예: 청계산=매봉 583m, 망경대 618m는 통제구역이라 제외).

**들머리**: 코스 시작점(trailhead).

**등반 세션(active hike)**: '등반 시작'부터 완등 인증/종료까지의 상태. SQLite `active_hike` 단일행, 위치 watch는 포그라운드만.

**아웃박스(outbox)**: 오프라인 인증의 durable 큐(expo-sqlite). 판정 통과 즉시 저장, 연결되면 flush. `awaiting_course` 상태는 flush 제외.

**effort / frontier**: `.scratch/<effort>/` = 진행 중 작업 단위, frontier = `map.md`에서 다음 착수 가능한 티켓.
