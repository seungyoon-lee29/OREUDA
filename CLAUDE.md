# 등산 앱 (Hiking App)

한국 등산 완등 인증 앱 **오르다**. GPS 한 점으로 코스 체크포인트 도착을 인증하고, 지도에서 완등한 코스를 색으로 채워나간다.

공용 에이전트 워크플로(Claude·Codex 공유): @AGENTS.md

## 구조

| 폴더 | 역할 |
| --- | --- |
| `api/` | NestJS v0 백엔드. 지오는 raw SQL(PostGIS), 엔티티는 users만. Fly.io 배포 |
| `mobile/` | Expo(SDK 57 / RN 0.86) 앱. dev client 필수 — 네이버 지도 native 모듈이라 Expo Go 불가 |
| `supabase/` | PostGIS 스키마 마이그레이션 + 시드/ETL(`supabase/etl`) |
| `docs/` | 기획·아키텍처 문서(01~07) + ADR + 에이전트 규약(`docs/agents/`). **바꾸기 전에 먼저 읽을 것** |

## 실행

```bash
# 백엔드 (api/.env 필요 — DATABASE_URL, JWT_SECRET)
cd api && npm run start:dev        # 로컬 :3000
node scripts/smoke.mjs             # E2E 스모크 — 체크 개수·커버리지의 기준은 스크립트 출력

# 앱 (dev client 빌드가 폰/시뮬레이터에 설치돼 있어야 함)
cd mobile && npx expo start        # 폰과 같은 Wi-Fi
```

- DB 마이그레이션 `/db-migrate` · API 배포 `/deploy-api` · E2E `/smoke-test` · iOS 시뮬 검증 레시피는 `HANDOFF.md` §검증/재현
- **배포 백엔드**: https://hiking-api-v0.fly.dev (Fly, nrt, auto stop/start)
- **Supabase**: ref `oviczroxkmqhvsaajbvz` (ap-northeast-1, PostGIS 3.3)

## 핵심 결정 (바꾸기 전 확인)

- **좌표는 `geography(Point,4326)`** — `geometry`면 `ST_DWithin`이 미터가 아니라 도(degree)로 재서 반경 판정이 조용히 다 통과됨. 문서 최상위 리스크(02).
- **`climbed_on` 생성 컬럼은 `kst_date()` immutable 래퍼 경유** — `AT TIME ZONE`은 stable이라 생성 컬럼에 직접 못 씀.
- **RLS는 enable만(정책 없음)** — PostgREST anon 노출 차단용. NestJS는 postgres role 직결이라 무관.
- **멱등성**: `client_ref` 유니크로 재전송은 200 replay. 하루 중복은 `uq_climbs_daily`로 거절.
- **에러 봉투**: `{ error: { code, message } }` 고정. 클라이언트는 `code`로 분기.
- **판정은 관대하게(lenient)**: 거리/속도/mock은 거절이 아니라 flag만. 문서 03 참조.

## 코드 스타일 — ponytail (게으른 시니어)

최소 코드가 정답. 사다리: ①필요없으면 스킵 ②이미 있으면 재사용 ③stdlib ④플랫폼 기능 ⑤기존 의존성 ⑥한 줄 ⑦그다음에야 최소 구현. 의도적 축소는 `ponytail:` 주석으로 남긴다. 단, 입력 검증·에러 처리·시크릿·접근성은 절대 축소 안 함.

## 하네스 — 규칙·도구 배선

- **로딩 그래프**: 이 파일(진입점) → `@AGENTS.md`(공용 워크플로 — Wayfinder 블록의 원본) → `.claude/rules/*.md`(해당 경로 편집 시 자동: `api-design.md`·`testing.md`) → `CONTEXT.md`(확정 도메인 어휘) → `docs/agents/`(workflow·collaboration·security·issue-tracker·triage-labels·domain) → 심층은 `docs/01~07`·`docs/adr/`.
- **우선순위**: 이 저장소 규칙 > 전역 `~/.claude/CLAUDE.md`. 단 시크릿·보안 규칙은 전역이 **하한** — 프로젝트 규칙이 약화할 수 없다.
- **도구 인벤토리(실존 검증 2026-07-16)**: 스킬 `/smoke-test` · 커맨드 `/db-migrate` `/deploy-api` `/polish` · 서브에이전트 `code-reviewer`(리뷰 전용, 수정 안 함) · 적대 리뷰 기본 codex. deferred MCP는 `ToolSearch` 로드 후 사용. 여기 없는 스킬을 지어내지 말 것. 위임 시 후보 스킬/MCP를 프롬프트에 명시하고 결과에서 실사용을 검증한다.
- **훅**: Bash 앞 `block-secrets.sh`, Edit/Write 뒤 `format-on-save.sh`(`.claude/hooks/`). 훅이 막으면 우회하지 말고 원인을 고친다.
- **SSOT — 두 곳에 적힌 규칙·상태는 반드시 드리프트한다**: 공용 워크플로 원본은 `AGENTS.md`(여기선 import만), 유동 상태는 종류별로 거처 하나(루프 ⑤). 복제하지 말고 참조한다.

## 루프 — 한 작업이 도는 사이클

- ① **시작 — 진행상황은 한 파일이면 충분**: 활성 effort가 있으면 `.scratch/<effort>/map.md`(frontier = '다음 할 일'의 유일 원본), 없으면 `HANDOFF.md` 최신 항목. 최근 세션의 gotcha·레시피가 필요할 때만 HANDOFF를 추가로 본다. claim 규약은 AGENTS.md→`docs/agents/workflow.md`. 워크트리의 기존 변경은 보존.
- ② **위임**: 메인 모델은 판단만(플랜·아키텍처·최종 리뷰 직접). 조사·구현·문서 수정 등 생산 작업은 서브에이전트에 위임. 단 trivial(한 줄 수정·오타·순수 읽기·자명한 조회)은 직접 OK — 콜드 스타트 위임이 결과를 안 바꿀 때. 그 이상을 직접 하려면 먼저 사용자 허락. **위임 모델은 하위 티어가 기본**: 기계적·대량(스캔·목록화·단순 변환·초안) = haiku, 일반 구현·조사·리뷰 = sonnet, 세션 모델(최상위)은 판단·아키텍처·적대 리뷰에만. 스폰 옵션(`model`)으로 지정한다 — 프롬프트 문구로 말고. 미지정 = 세션 모델 상속 = 토큰 ×N.
- ③ **게이트(리스크 비례)**: **틀리면 비싼 것**(지오 판정 `geography`/`ST_DWithin` · DB 마이그레이션 · RLS · 멱등성 · 시크릿) = 리뷰 → 적대 리뷰(codex) → 메인 판단 후 반영. **일반 코드** = `code-reviewer` 1패스 + 판단. **docs·문구** = 게이트 생략(④의 참조 확인만).
- ④ **완료 게이트 — "완료" 선언 전 scope별 실행**: `api/`·`supabase/` = 스모크 통과(`/smoke-test`, 마이그레이션은 `/db-migrate`의 불변식 검증 포함) · `mobile/` = `npx tsc` + 단위 테스트 + 실제 런타임(시뮬/폰) 확인 · **docs-only** = 참조한 파일·스킬·링크의 실존 확인.
- ⑤ **기록 — 써야 작업이 끝난다. 종류별 거처는 하나**: 진행·frontier 이동 → `.scratch/<effort>/map.md`(유일 원본 — '다음 할 일' 목록을 딴 데 복제 금지) / 세션·effort 경계의 요약·gotcha·재현 레시피 → `HANDOFF.md` 최상단(커밋되는 저널. '다음 할 것'은 frontier 포인터 한 줄만) / 번복 비싼 결정 → `docs/adr/` / 확정 용어 → `CONTEXT.md`. **유동 상태를 이 파일·README에 복제 금지.**

## 시크릿 취급 (엄수)

- `**/.env`는 gitignore. `DATABASE_URL`·`JWT_SECRET` 값은 **절대 출력/로그/커밋 안 함**. 구조 확인은 마스킹·grep으로만.
- NCP Client ID(`3mohcujert`)는 공개 가능. **Client Secret은 절대 공유 안 함**.
- 계정 로그인·가입·결제는 사용자가 직접(Fly/EAS/NCP/Supabase).
- 평문 크리덴셜 발견 시 즉시 보고 + 로테이션 권고(전역 하한). 설정 파일·allowlist·로컬 메모도 예외 아님.
