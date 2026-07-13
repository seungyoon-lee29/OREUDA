# 등산 앱 (Hiking App)

한국 등산 완등 인증 앱. GPS 한 점으로 코스 체크포인트 도착을 인증하고, 지도에서 완등한 코스를 색으로 채워나간다.

## 구조

| 폴더 | 역할 |
| --- | --- |
| `api/` | NestJS v0 백엔드. 지오는 raw SQL(PostGIS), 엔티티는 users만. Fly.io 배포 |
| `mobile/` | Expo(SDK 57 / RN 0.86) 앱. dev client 필수 — 네이버 지도 native 모듈이라 Expo Go 불가 |
| `supabase/` | PostGIS 스키마 마이그레이션 + v0 시드(북한산/관악산/청계산) |
| `docs/` | 기획·아키텍처 문서(01~07) + ADR. **바꾸기 전에 먼저 읽을 것** |

## 실행

```bash
# 백엔드 (api/.env 필요 — DATABASE_URL, JWT_SECRET)
cd api && npm run start:dev        # 로컬 :3000
node scripts/smoke.mjs             # E2E 스모크 (또는 /smoke-test 스킬)

# 앱 (dev client 빌드가 폰/시뮬레이터에 설치돼 있어야 함)
cd mobile && npx expo start        # 폰과 같은 Wi-Fi

# DB 마이그레이션 (/db-migrate 스킬 참고)
```

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

## 작업 규칙 (AI 위임·리뷰)

- **메인 모델은 판단만** — 플랜·아키텍처·최종 리뷰만 직접. 조사·구현·문서 수정 등 생산 작업은 서브에이전트에 위임. 단 **trivial한 건(한 줄 수정·오타·순수 읽기·자명한 조회)은 직접 OK** — 콜드 스타트 위임이 결과를 안 바꿀 때. 그 이상은 위임하고, 굳이 직접 하려면 먼저 사용자 허락.
- **확정 게이트는 리스크에 비례**:
  - **틀리면 비싼 것**(지오 판정 `geography`/`ST_DWithin`·DB 마이그레이션·RLS·멱등성·시크릿) = 리뷰 → 적대적 리뷰 → 메인 판단 후 반영.
  - **일반 코드** = 리뷰 1패스 + 판단. **docs·문구** = 게이트 생략.
- **적대적 리뷰는 원 작성자와 다른 모델로** — 같은 모델의 자기 리뷰는 블라인드 스팟이 상관됨. codex를 기본 적대자로, 없으면 다른 관점의 서브에이전트.
- **완료 게이트** — "완료" 선언 전 `node scripts/smoke.mjs`(또는 `/smoke-test`) 통과, 앱 변경은 실제 런타임(시뮬/폰)으로 확인.
- **스킬/MCP는 메인·서브 공통으로 작업 전 확인**하고 맞으면 쓴다(`/smoke-test`·`/db-migrate` 등). deferred MCP는 `ToolSearch`로 로드 후 사용. 위임 시 후보 스킬/MCP를 프롬프트에 명시하고 결과에서 실제 사용 여부를 검증한다.
- 경로별 상세 규칙은 `.claude/rules/*.md`가 해당 파일 편집 시 자동 로드 — API 설계(`api-design.md`), 테스트(`testing.md`).

## 시크릿 취급 (엄수)

- `**/.env`는 gitignore. `DATABASE_URL`·`JWT_SECRET` 값은 **절대 출력/로그/커밋 안 함**. 구조 확인은 마스킹·grep으로만.
- NCP Client ID(`3mohcujert`)는 공개 가능. **Client Secret은 절대 공유 안 함**.
- 계정 로그인·가입·결제는 사용자가 직접(Fly/EAS/NCP/Supabase).

## 지금 상태

백엔드·DB·앱 코드 완성, 프로덕션 배포+스모크 통과. **앱 런타임 검증만 남음**(iOS 시뮬레이터 진행 중). 자세한 진행은 `HANDOFF.md`와 Claude 메모리 참조.

## Agent skills

### Issue tracker

이 저장소의 이슈는 GitHub Issues에서 관리한다. 자세한 규칙은 `docs/agents/issue-tracker.md`를 참조한다.

### Triage labels

기본 triage 라벨 어휘를 사용한다. 자세한 매핑은 `docs/agents/triage-labels.md`를 참조한다.

### Domain docs

단일 컨텍스트 구조를 사용한다. 자세한 규칙은 `docs/agents/domain.md`를 참조한다.
