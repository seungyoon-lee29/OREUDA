# Agent collaboration

The main agent owns scope, risk decisions, integration, verification and the final report. Delegation never transfers final responsibility.

## Ownership

- Delegate only independent work with explicit objective, owned files, requirements, interface contract, acceptance criteria and out-of-scope boundary.
- Keep one owner per file.
- Keep shared contracts, migrations, composition roots and index files under one integration owner.
- Do not switch branches in a shared worktree.
- Preserve changes made by users or other agents.
- Stage, commit and push only when explicitly authorized; keep these actions with the main integrator by default.

## Validation and review

- Inspect delegated artifacts directly and rerun risk-appropriate checks.
- Validate through the actual user-facing or runtime surface, not only static checks.
- Fix Critical and High findings before completion.
- Fix Medium findings or record impact, reason and follow-up.
- Use one integrated review and one affected-scope re-review by default.

## External effects and secrets

- Never stage environment files, secret stores, credentials, tokens or raw account identifiers.
- Use deterministic local adapters for default tests.
- Require explicit gates for email, deployment, billing, external mutation and live operations.
- Ask the user when additional authority or a material product decision is required.

