# WS4 — 광범위 감사 (내가 말하지 않은 오류들)

조사일: 2026-07-16 · 대상: api/src, mobile/src, supabase/, docs/02·03·04 대조.
이미 발견된 4건(접근로 포함 path, 클라 하드 게이트, summit 좌표 실측, search region 그룹핑)은 제외.
capture.tsx·climbs.ts는 uncommitted 수정본(soft-confirm/ON CONFLICT 반영본) 기준으로 감사함.

---

## HIGH

### [HIGH] H1. 재시도 가능한 429(THROTTLED)가 failed_permanent로 영구 종결 — 완등 유실
- 근거: `mobile/src/lib/outbox.ts:240-245` — `e.status >= 400 && e.status < 500` 전부 `failed_permanent`. 429 포함.
  `api/src/climbs.ts:91` — POST /climbs 스로틀 30회/시간, `api/src/app.module.ts:24` ThrottlerGuard 기본 트래커 = **IP**.
  `api/src/http.ts:37` — 서버는 429에 `Retry-After: 60`을 보내는데 클라가 무시.
- 영향: 스로틀은 IP 키라서 한국 통신사 CGNAT(수천 사용자가 egress IP 공유) 환경에서 **남의 트래픽 때문에** 내 완등이 429를 맞을 수 있고, 맞는 순간 초안이 영구 실패로 박제된다. `failed_permanent`는 재시도 경로가 없다 — records.tsx:61의 행 탭 flush는 `queued`만 올리므로(⚠️ 제출 실패 행은 탭해도 무동작), 사용자는 삭제밖에 못 한다. `last_error`도 UI에 미표시(`records.tsx:63-73`).
- 수정 1줄: outbox catch에서 429(와 401)는 `queued` 재큐로 분기하고, 인증 쓰기 스로틀 키를 IP→userId로 전환.

### [HIGH] H2. 같은 사용자 재로그인 시 미전송 완등 초안 전량 삭제 — 명시된 보존 의도와 모순
- 근거: `mobile/src/lib/stores.ts:26-28` — "refresh 실패 시 자동 logout은 purge 안 함, 같은 사용자 재로그인 시 미동기 draft 보존"이라고 명시.
  그러나 `mobile/src/app/login.tsx:24-28`·`signup.tsx:24-26` — 로그인/가입 성공 시 **무조건** `purgeLocalData()`(climb_drafts + active_hike 삭제, `outbox.ts:116-122`).
- 영향: refresh 만료 → 게이트 → 같은 계정 재로그인 경로에서, "인증 완료!"를 봤지만 아직 전송 안 된 완등이 소리 없이 전부 사라진다. stores.ts의 보존 설계가 실제로는 한 번도 작동하지 않음.
- 수정 1줄: 마지막 로그인 계정 식별자(예: 이메일 해시)를 로컬 보관하고 **다른 계정일 때만** purge(같은 계정이면 보존 후 flush).

### [HIGH] H3. "나중에 선택할게요"의 후속 코스 부착 경로가 없음 + 위저드 이탈 = 취소 불가 자동 제출
- 근거: `mobile/src/app/capture.tsx:287-289` — "나중에 선택할게요" 버튼은 courseId=null로 즉시 제출 큐 승격. `capture.tsx:164-172` — ✕/뒤로가기 등 **모든 이탈도** finalize(=null 제출). 이후 코스를 부착하는 UI는 앱 어디에도 없음(grep: attachCourse 호출은 capture 내부뿐). `records.tsx:121-124` — 해당 기록은 "위치 인증 완료" 카드로 표시, mountain=null이라 탭 불가.
- 영향: (1) 문구가 약속한 '나중에'가 거짓 — null 완등은 영구히 지도 색칠·totalMountains·티어에서 소외된다. (2) select_course 단계에서 마음을 바꿔 ✕를 눌러도 이미 durable+자동 제출되고, 클라에 완등 삭제 UI가 없어(하단 L7) 되돌릴 수 없다.
- 수정 1줄: 기록 탭의 null-코스 카드에 "코스 선택" 액션(서버에 PATCH 또는 삭제+재제출) 추가, 최소한 문구를 "코스 없이 기록할게요"로 정직하게.

---

## MEDIUM

### [MEDIUM] M1. 기기 시계 skew(미래)면 모든 인증이 VALIDATION_CAPTURED_AT 400 → 영구 실패, 허용오차 0
- 근거: `api/src/climbs.ts:61-65,99-100` — `capturedAt > now`면 즉시 4xx, 관용창 없음. `mobile/src/app/capture.tsx:119` — capturedAt = `loc.timestamp`(기기 시계). 4xx는 H1과 같이 failed_permanent 종결.
- 영향: 시계를 수동으로 몇 분 빠르게 쓰는 사용자(자동 시간 꺼짐)는 **모든** 완등이 사유 안내 없이 영구 실패. 발생 빈도는 낮지만(추측: NTP 기본 on) 걸리면 전면 장애.
- 수정 1줄: 서버 future 판정에 2~5분 허용오차(`+capturedAt > +now + SKEW_MS`) 추가.

### [MEDIUM] M2. active_hike 세션에 신선도 가드 없음 — 스테일 세션이 운동 요약을 왜곡
- 근거: `mobile/src/lib/outbox.ts:59-61` — 세션은 앱 재시작을 넘겨 영속, 만료 없음. `mobile/src/lib/hikeStats.ts:33-41` — duration 상한 없음(속도만 12km/h 가드). `capture.tsx:184-195` — 인증 시 그대로 요약 계산.
- 영향: 등반 시작 후 종료를 잊고 이틀 뒤 다른 인증을 하면 "운동 시간 49시간 · 예상 소모 21,000kcal" 같은 명백한 허수가 성공 화면에 표기된다(문서의 '가짜 숫자 금지' 취지 위반). 배너의 "N시간째"는 보이지만 강제 종료는 안 됨.
- 수정 1줄: `computeHikeSummary`에서 durationMs가 상한(예: 16h) 초과면 null 반환(요약 스킵).

### [MEDIUM] M3. 등반 중 다른 코스 '등반 시작'이 기존 세션을 무확인 덮어쓰기
- 근거: `mobile/src/app/(tabs)/index.tsx:576-602` — selectedIsActive가 아니면 CTA는 항상 `startHike`. `outbox.ts:79-85` — `INSERT OR REPLACE`로 단일행 대체(start_altitude도 초기화).
- 영향: 등반 중 다른 산/코스를 구경하다 탭 한 번이면 진행 중 세션(경과시간·시작고도)이 소리 없이 소멸 — 완등 인증 시 운동 요약도 사라지거나 왜곡.
- 수정 1줄: activeHike 존재 시 "진행 중인 등반을 종료하고 새로 시작할까요?" Alert 1개.

### [MEDIUM] M4. 미전송 완등 초안 '삭제'가 원탭 무확인
- 근거: `mobile/src/app/(tabs)/records.tsx:74-76` — `deleteDraft` 즉시 실행. 초안은 미전송 완등의 유일본(서버에 없음).
- 영향: 리스트 행 안의 작은 '삭제' 오탭 한 번으로 완등이 영구 소실. H1과 결합하면(실패 표시 행에서 삭제만 가능) 유실 압력이 더 커짐.
- 수정 1줄: `Alert.alert('아직 전송 안 된 기록이에요. 삭제할까요?')` 확인 1단계.

### [MEDIUM] M5. Sentry 미통합 — 문서상 "v0 필수" + 단위버그 감시 계약 미이행
- 근거: `docs/04-client-architecture.md:34` — "@sentry/react-native | v0 필수". `docs/03-verification.md:80` — "로컬 거리 vs 서버 distance_m 괴리 시 Sentry 이벤트"가 단위버그(전부 통과) 방어선의 일부. mobile/package.json·src에 sentry 부재(grep 0건).
- 영향: 문서가 최상위 리스크 방어선으로 지정한 계측이 실제로는 없다. 괴리 감지 로직 자체도 클라에 없음.
- 수정 1줄: Sentry 도입 + capture 시 |haversine−distanceM| 임계 초과 이벤트 1개, 또는 docs 03·04를 v0 현실로 하향 갱신(둘 중 하나로 SSOT 정합).

### [MEDIUM] M6. 시드 데이터 내부 모순 — 북한산성 distance 2811m vs 원문 "거리 4km", 일자산 고도 74m(실제 ~134m)
- 근거: `supabase/seed.sql:24` — distance_m=2811인데 같은 행 source_difficulty_raw는 "거리 4km, 누적고도 700m+". `supabase/seed_seoul.sql:24` — 일자산 elevation 74m; `supabase/etl/config.mjs:31`은 ele:134를 폴백으로 두었으나 `build.mjs:134`가 OSM peak tag(74)를 무조건 우선해 덮어씀(일자산 정상 134m가 통설 — OSM 태그 오염 추측). 같은 로직으로 우면산 313m(config 293) 등도 재검 필요.
- 영향: (a) 코스 카드의 거리·소요시간이 원천 판정 근거와 모순 — 근사 path 합산이 실거리를 과소표기(기존 발견 #1 접근로 문제와 반대 방향의 품질 이슈). (b) 산 상세/검색의 고도 표기가 틀림 + duration/difficulty 휴리스틱 입력(상승고도)도 왜곡.
- 수정 1줄: build.mjs에서 `ele = tag와 config 폴백의 괴리가 크면 config 우선(또는 사람 검수 리스트)`로 바꾸고, seed.sql 3산 distance는 실경로 기준 재산출.

### [MEDIUM] M7. duplicate_day·4xx reconcile 고지 미구현 + records의 '이미 인증된 코스' 분기는 도달 불가 죽은 코드
- 근거: `docs/04-client-architecture.md:101-108` 매핑표 — duplicate_day는 "기록 탭 정리 + '이미 인증된 코스예요, 기존 기록이 유지돼요' 1줄", 4xx는 "기록 탭 고지". 구현: `outbox.ts:236-238`은 2xx면(duplicate 포함) draft를 무언 삭제, server_result_json 미보관(§4.2 confirmed 상태도 미구현 — ponytail 주석으로 의도 축소했으나 문서 미갱신). `records.tsx:112-118`의 else 분기("이미 인증된 코스")는 서버가 `/me/climbs`에서 verified만 반환(`api/src/climbs.ts:218`)하므로 렌더될 수 없음.
- 영향: 하루 중복 제출 사용자는 아무 피드백 없이 대기 항목만 사라짐(문서가 약속한 1줄 고지 부재). 죽은 분기는 유지보수 오독 유발.
- 수정 1줄: duplicate_day 응답 시 로컬 1회성 알림(또는 문서를 무고지로 하향) + records의 죽은 else 분기 삭제.

---

## LOW

### [LOW] L1. 회원가입 이메일 중복 레이스 → 500 INTERNAL (봉투 규약 위반)
- 근거: `api/src/auth.ts:53-60` — exists→save 2단계, `users.email unique`(migrations:7) 충돌 시 QueryFailedError → ErrorFilter 500 'internal error'. api-design 규칙(제약-이름 디스패치) 미적용 유일 경로.
- 영향: 동시 가입 레이스에서 사용자에게 "가입에 실패했어요"만 표시(코드 분기 불가). 빈도 극히 낮음.
- 수정 1줄: catch에서 email unique 제약이면 `err(409, 'AUTH_EMAIL_TAKEN', …)` 재던짐.

### [LOW] L2. UI 금칙어 '정복' 잔존
- 근거: `mobile/src/app/(tabs)/profile.tsx:61` — 배지 칩 텍스트 '정복'. `CONTEXT.md` — "정복·미정복: Pass 1에서 UI 전수 교체된 금칙어".
- 영향: 도메인 어휘 규칙 위반 1건(사용자 노출 문구).
- 수정 1줄: '정복' → '완등' (칩 1개).

### [LOW] L3. courseId=null 완등은 하루 중복 제한이 아예 없음
- 근거: `supabase/migrations/20260703000000_init.sql:66-67` — `uq_climbs_daily(user_id, course_id, climbed_on)`에서 NULL course_id는 NULLS DISTINCT라 미적용. `api/src/climbs.ts:154-156` ON CONFLICT도 매칭 안 됨.
- 영향: 같은 날 null-코스 인증을 무한 반복 → totalClimbs 부풀림 가능(전체 완등 카운터·리더보드[v1] 오염). 의도인지 불명 — 의도라면 문서화 필요.
- 수정 1줄: v1 전에 `uq_climbs_daily_nullcourse (user_id, climbed_on) where course_id is null and status='verified' and deleted_at is null` 추가 검토.

### [LOW] L4. confirm_marginal이 distance·accuracy 동시 발생 시 한 사유만 표시
- 근거: `mobile/src/app/capture.tsx:232-239` — title/body 모두 `reasons.includes('distance')` 우선, accuracy 정보 소실.
- 영향: 저정확도+원거리 동시 상황에서 사용자가 오차 정보를 못 봄. 표시 문제만.
- 수정 1줄: reasons 둘 다 있으면 body에 두 줄 병기.

### [LOW] L5. 검색·지도 조회 실패 시 오도성 빈 상태
- 근거: `mobile/src/app/search.tsx:37-41,108` — `/mountains` 실패 시 기본값 []로 "검색 결과가 없어요" 표시(에러/재시도 없음). `index.tsx:63-70` — 타일 코스 fetch 실패 시 무표시(빈 지도).
- 영향: 오프라인/서버 장애를 "산이 없다"로 오독. records.tsx는 에러+재시도가 있는 것과 비대칭.
- 수정 1줄: isError면 "불러오지 못했어요 · 다시 시도" 문구로 교체(records 패턴 재사용).

### [LOW] L6. 성공 화면 완등 카운터가 stale — 첫 완등에선 아예 미표시
- 근거: `mobile/src/app/capture.tsx:293-301,384-387` — `meClimbs?.totalMountains ?? 0`은 이번 완등 반영 전 서버 값. 0이면 칩 숨김 → 가장 중요한 첫 완등 순간에 카운터 부재, 이후에도 flush 완료 시점에 숫자가 도중에 점프할 수 있음.
- 영향: "지금까지 N좌"가 방금 인증을 포함하지 않아 오독 소지. 연출 품질 문제.
- 수정 1줄: 로컬 파생(verified.size 또는 totalMountains+isNewMountain)으로 낙관 표기.

### [LOW] L7. DELETE /v1/climbs/:id 클라 미사용 — 완등 삭제 수단 없음
- 근거: `api/src/climbs.ts:229-239` 구현·문서(02 §5)에 존재하나 mobile 전체 grep에서 호출 0건. records에 완등 카드 삭제 UI 없음.
- 영향: 오인증(H3의 자동 제출 포함)을 사용자가 되돌릴 수 없음. 서버 코드는 스모크 전용 사실상 죽은 표면.
- 수정 1줄: records 카드에 삭제(soft delete) 액션 1개 추가 — 서버는 이미 준비돼 있음.

### [LOW] L8. 타일 마진 bbox가 타일 경계(x=0/x=n−1)에서 ±180 초과 → 서버 400
- 근거: `mobile/src/lib/geo.ts:25-33` — `tile2lng(x-1)`/`tile2lng(x+2)`가 경계에서 −180.17…/180.17… 생성, `api/src/catalog.ts:11`이 400 거절.
- 영향: 한국 좌표에선 도달 불가(x≈1746/2048). 지도를 안티메리디안까지 팬해야 발생 — 이론적 결함.
- 수정 1줄: bbox 산출 시 lng를 [−180,180]로 clamp.

### [LOW] L9. ETL 난이도 휴리스틱 — 평지 산책로가 'moderate'
- 근거: `supabase/etl/build.mjs:141-142` — `distM >= 2500 → not easy`가 상승고도 무관하게 적용. 예: 일자산 2537m/상승 34m → moderate(`seed_seoul.sql:230`).
- 영향: 사실상 평지 코스가 '보통' 난이도로 표기 — 카탈로그 신뢰 저하(경계 1~2건).
- 수정 1줄: easy 조건을 `ascent < 100이면 distM < 4000까지 easy`식으로 상승 우선으로.

### [LOW] L10. 문서-구현 드리프트 잔여(설계는 확정 변경됐으나 04 미갱신)
- 근거: `docs/04-client-architecture.md:141` 줌 히스테리시스(z≥11.5/z<10.5) — 구현은 "산 탭해야 코스선"(`index.tsx:285-292`)으로 대체. `04:50,95` server_result_json/confirmed 상태 — 구현은 draft 즉시 삭제(`outbox.ts:236-238`). `04:69-75` 위저드 상태도(out_of_range/low_accuracy)는 soft-confirm 전환(기발견 #2)으로 무효.
- 영향: 04가 "클라 상태 정본"을 자처하는데 3곳이 실물과 다름 — 다음 작업자 오독 위험.
- 수정 1줄: 04 §4.1·§4.2·§7을 현 구현(soft-confirm/무보관/산-탭 게이트)으로 일괄 갱신.

---

## 확인만 하고 이슈로 남기지 않은 것 (오탐 방지 기록)
- **flags 클라 미노출**: `docs/03:56`·`04:105`가 "flagged는 렌더 완전 동일, v0 기록 상세에도 미노출"을 명시 — 버그 아니라 문서화된 설계로 확인.
- **catalog `st_intersects(path, envelope)`**: path는 geometry(LineString)라 geometry끼리 연산 — geography 불변식(포인트 판정 컬럼)과 무관, 정상.
- **wireOutbox의 uploading→queued 재큐/awaiting_course 승격, flush 세션-세대 가드, api() 401 오귀속 가드**: 설계 의도대로 동작 확인.
- **kst_date·ON CONFLICT partial arbiter**: 마이그레이션 인덱스 술어와 일치, 정상.
