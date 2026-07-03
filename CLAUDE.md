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
node ../scratchpad/smoke.mjs       # E2E 스모크 (또는 /smoke-test 스킬)

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

## 시크릿 취급 (엄수)

- `**/.env`는 gitignore. `DATABASE_URL`·`JWT_SECRET` 값은 **절대 출력/로그/커밋 안 함**. 구조 확인은 마스킹·grep으로만.
- NCP Client ID(`3mohcujert`)는 공개 가능. **Client Secret은 절대 공유 안 함**.
- 계정 로그인·가입·결제는 사용자가 직접(Fly/EAS/NCP/Supabase).

## 지금 상태

백엔드·DB·앱 코드 완성, 프로덕션 배포+스모크 통과. **앱 런타임 검증만 남음**(iOS 시뮬레이터 진행 중). 자세한 진행은 `HANDOFF.md`와 Claude 메모리 참조.
