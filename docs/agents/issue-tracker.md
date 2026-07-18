# Issue tracker: 로컬 Markdown (`.scratch/`)

2026-07-16 단일화: 이 저장소의 트래커는 `.scratch/<effort>/`의 로컬 Markdown이다 — 규범은 `docs/agents/workflow.md` §Ticket tracking surfaces. GitHub Issues는 워크플로 밖(아래 §GitHub).

## Conventions

- **티켓** = `.scratch/<effort>/issues/<NN>-<slug>.md`. 헤더 필드: `Type` / `Status`(open·claimed·resolved) / `Triage`(`triage-labels.md` 어휘) / `Depends on` / `Blocked by` / `Owner` / `Claimed at` / `Last heartbeat`. 본문: Objective, Owned scope, Requirements, Interface contract, Acceptance criteria, Out of scope.
- **Map** = `.scratch/<effort>/map.md` — Destination, Decisions so far, Current frontier(티켓 링크), Not yet specified(백로그), Out of scope.
- **Frontier query**: 맵 순서상 첫 unblocked·unclaimed open 티켓(`run-project-frontier` 스킬 계약).
- **Claim**: 티켓의 `Status`/`Owner`/`Claimed at`/`Last heartbeat`를 원자적으로 갱신.
- **Resolve**: 티켓에 `Answer`·`Changed files`·`Validation`·`Review`·`Residual risks`를 기록하고 `Status: resolved`, map.md의 frontier·Decisions 갱신.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(`/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

활성 effort가 있으면 `issues/<NN>-<slug>.md` 티켓을 만들어 map.md frontier에 링크한다. 아직 스케줄 안 된 아이디어·버그는 map.md §Not yet specified에 한 줄.

## When a skill says "fetch the relevant ticket"

해당 `.scratch/<effort>/issues/<NN>-<slug>.md` 파일을 읽는다.

## GitHub (외부 인입 전용 — 평시 사용 안 함)

저장소 공개 후 외부 버그 리포트가 생기면: `gh issue view <n> --comments`로 읽고 `.scratch/` 티켓으로 승격한 뒤 `gh issue close <n> --comment "..."`. 그 외 워크플로 용도로 GitHub Issues를 쓰지 않는다. 기존 닫힌 이슈들은 아카이브로 둔다.
