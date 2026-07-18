<!-- project-wayfinder:start -->
## Project Wayfinder

Use the repository-native workflow in `docs/agents/workflow.md`. Track current work under `.scratch/<effort>/`, use `CONTEXT.md` for domain vocabulary and record durable decisions in `docs/adr/`.

Before implementation, identify and claim the current frontier, preserve existing worktree changes and follow the acceptance, review and completion gates in the shared agent documents.

Project invariants and secrets handling live in `CLAUDE.md` (geography(Point,4326) 좌표 타입, kst_date, 에러 봉투, 멱등성, lenient 판정, `.env` 시크릿 취급) and `docs/` specs — read them before touching `api/`, `supabase/` or `mobile/`. Codex and Claude Code share the same source of truth.
<!-- project-wayfinder:end -->
