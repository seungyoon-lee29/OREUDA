---
description: supabase/migrations 의 신규 마이그레이션을 Supabase(oviczroxkmqhvsaajbvz)에 적용하고 검증
argument-hint: [마이그레이션 파일명 또는 설명]
allowed-tools: mcp__plugin_supabase_supabase__apply_migration, mcp__plugin_supabase_supabase__execute_sql, mcp__plugin_supabase_supabase__list_migrations
---

Supabase 스키마 마이그레이션을 적용한다. 대상: $ARGUMENTS

1. `list_migrations` 로 이미 적용된 것과 대조 — 재적용 방지.
2. `supabase/migrations/` 의 해당 SQL을 읽고, **파괴적 구문(drop/truncate/delete)**이 있으면 사용자에게 먼저 확인.
3. `apply_migration` 으로 적용.
4. 검증 (문서 02의 핵심 불변식):
   - 좌표 컬럼이 `geography(Point,4326)` 인지 (`geometry`면 반경 판정이 다 통과 — 최상위 리스크).
   - `climbed_on` 생성 컬럼이 `kst_date()` 경유인지.
   - RLS가 enable 됐는지(정책 없음, PostgREST anon 차단).
   - `ST_DWithin` 미터 시맨틱 스팟체크: 체크포인트 91m=true, 500m=false.

주의: MCP 툴 안 뜨면 `/reload-plugins` 먼저. 프로덕션 직결이니 apply 전 SQL을 반드시 눈으로 확인.
