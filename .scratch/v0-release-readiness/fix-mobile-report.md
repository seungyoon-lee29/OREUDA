# fix-mobile-report — WS4 퀵픽스 배치 (mobile/ 10건)

작업일: 2026-07-16 · 티켓: issues/03-ws4-fixbatch.md · 근거: ws4-broad-audit.md
범위: mobile/ 만 수정(api/·supabase/ 무변경). capture.tsx의 미커밋 의도 변경(confirm_marginal 소프트 확인, marginal nearest 선부착 + '나중에 선택' 숨김) 보존. 커밋 안 함.

## 항목별 수정

| # | 항목 | 파일:라인 | 내용 |
| --- | --- | --- | --- |
| 1 | H1 outbox 429/401 재큐 | `mobile/src/lib/outbox.ts:250-260` | flush catch에서 4xx 일괄 failed_permanent 중 **429·401 제외 → queued 재큐**. 주석에 이유(429=IP 스로틀 일시적/CGNAT, 401=세션 만료 후 재로그인 시 재전송돼야) |
| 2 | H2 같은 계정 재로그인 draft 보존 | `mobile/src/lib/prefs.ts:11-15`, `mobile/src/lib/outbox.ts:124-132`, `mobile/src/app/login.tsx:27`, `mobile/src/app/signup.tsx:25` | 마지막 로그인 계정(이메일 lowercase)을 MMKV `last_account_v1`에 보관. 신설 `reconcileLocalDataForAccount(email)` 단일 초크포인트 — **다른 계정만 purge, 같은 계정이면 보존+flush()**. login/signup의 무조건 purgeLocalData() 호출 교체. stores.ts signOut(명시 로그아웃) purge는 유지(기존 의도) |
| 3 | H3 카피 정직화 + 완등 삭제 UI | `mobile/src/app/capture.tsx:303`, `mobile/src/app/(tabs)/records.tsx:32-49,143-156,270` | '나중에 선택할게요'→'코스 없이 기록할게요'. records 완등 카드에 삭제 버튼 — `DELETE /climbs/:id`(api.ts 재사용), `Alert.alert` 확인 1단계('완등 기록을 삭제할까요?'), 성공 시 `me-climbs` invalidate, 실패 시 실패 Alert. `accessibilityRole/Label` 부착 |
| 4 | M2 hikeStats 16h 상한 | `mobile/src/lib/hikeStats.ts:16-18,39`, `mobile/src/lib/hikeStats.test.js:7,19,50-54` | `MAX_HIKE_MS = 16h`, `durationMs > MAX_HIKE_MS → null`(스테일 세션 허수 방지). 경계 테스트 추가: 정확히 16h=요약, 16h+1ms=null |
| 5 | M3 등반 중 새 시작 확인 | `mobile/src/app/(tabs)/index.tsx:596-629` | activeHike 존재 시 '등반 시작' 탭 → `Alert.alert('진행 중인 등반이 있어요', '종료하고 새로 시작할까요?')` [취소/새로 시작(destructive)]. 기존 시작 로직은 `begin()`으로 묶어 확인 후 실행 |
| 6 | M4 초안 삭제 확인 | `mobile/src/app/(tabs)/records.tsx:97-110` | deleteDraft 원탭 → `Alert.alert('아직 전송 안 된 기록이에요. 삭제할까요?')` 확인 후 삭제. hitSlop·접근성 라벨 추가 |
| 7 | M7 죽은 else 분기 삭제 | `mobile/src/app/(tabs)/records.tsx:142-146` | '이미 인증된 코스' 분기 삭제(서버 /me/climbs는 verified만 반환 → 도달 불가). `alreadyText` 스타일도 제거 |
| 8 | L2 금칙어 '정복' | `mobile/src/app/(tabs)/profile.tsx:61` | 배지 칩 '정복'→'완등' (1단어) |
| 9 | L5 조회 실패 오도 빈상태 | `mobile/src/app/search.tsx:37,109-118,164-165`, `mobile/src/app/(tabs)/index.tsx:462-475,739-747` | search: isError면 '산 목록을 불러오지 못했어요. 눌러서 다시 시도'(records errorBox 패턴). index(지도): 타일 코스 fetch isError면 상단 '코스를 불러오지 못했어요 · 다시 시도' pill → refetch |
| 10 | L8 bbox lng clamp | `mobile/src/lib/geo.ts:27-28` | `tile2lng`에 `[-180,180]` clamp 1줄 — 타일 경계(x=0/n−1) 마진이 서버 bbox 400 안 맞게 |

## 검증

- `npx tsc --noEmit` → **0 에러** (exit 0)
- `node --test src/lib/*.test.js` → **22/22 pass, 0 fail** (신규 M2 경계 테스트 '스테일 세션 경계: 정확히 16h는 요약, 16h+1ms는 null' 포함)
- `npx eslint` (변경 11개 파일) → **0 경고** (exit 0)
- 시뮬 눈검증은 메인 통합 검증에서(티켓 지시대로 미실행)

## 메모

- H2의 계정 식별자는 이메일 lowercase 평문(MMKV) — 로컬 기기 한정 비교라 해시 불필요(ponytail, 티켓 승인).
- H1에서 Retry-After 존중은 선택 항목이라 스킵 — 기존 flush 트리거(AppState/NetInfo/콜드스타트)가 자연 백오프 역할.
- M7 삭제 후에도 카드의 `item.status === 'verified' && <PeakMark>` 가드는 유지(무해한 방어).
