# Project workflow

This repository uses local Markdown Wayfinder tracking.

- Specification: `.scratch/<effort>/spec.md`
- Map: `.scratch/<effort>/map.md`
- Tickets: `.scratch/<effort>/issues/<NN>-<slug>.md`
- Domain vocabulary: `CONTEXT.md`
- Durable decisions: `docs/adr/`

Read `issue-tracker.md`, `triage-labels.md`, `domain.md` and `collaboration.md` before changing the workflow.

## Ticket tracking surfaces (단일화 — 2026-07-16)

트래커는 로컬 Markdown 하나다. 2026-07-15의 이원화(+GitHub Issues)는 솔로 개발 페이스에 과해서 접었다(사용자 확정). 접는 시점 열린 GitHub 이슈 0개 — 유실 없음.

- **`.scratch/<effort>/`** = 유일한 트래커. 맵·명세·번호 티켓, frontier 선택·claim·heartbeat, 백로그(map.md §Not yet specified). `run-project-frontier` 스킬이 읽는 곳. durable해야 하므로 커밋 체크포인트에 포함한다.
- **`HANDOFF.md`** = 트래커가 아니라 **커밋되는 세션 저널**(한 것·gotcha·재현 레시피·effort 종료 요약). '다음 할 일'의 원본은 frontier(map.md) 하나 — HANDOFF에는 포인터 한 줄만.
- **GitHub Issues** = 워크플로 밖. 저장소가 공개돼 외부 리포트를 받게 되면 인입 창구로만 재개하고, 인입 즉시 `.scratch/` 티켓으로 승격한다(`issue-tracker.md` §GitHub).

## Execution loop

1. Read the map and dependency graph.
2. Select the first eligible frontier ticket.
3. Run Git preflight and preserve unrelated changes.
4. Claim the ticket atomically.
5. Read relevant domain and architecture contracts.
6. Implement one observable vertical slice.
7. Run targeted checks, repository checks and manual QA.
8. Review findings and revalidate fixes.
9. Record completion evidence and residual risk.
10. Resolve, update the map, clear blockers and create a commit checkpoint when authorized.

Project profile: `high-risk`.

## Scale — gates are proportional

The full loop and effort scaffold (`spec.md`/`map.md`/tickets) are for feature-scale work. Trivial-scale work (docs-only, one-liners, typos) skips the scaffold and uses only the gates in `CLAUDE.md` §루프: reference checks for docs, one review pass for code. Never skipped regardless of scale: the `high-risk` surfaces in `docs/agents/security.md` — geo judgment, DB migrations, RLS, idempotency, auth, secrets.

