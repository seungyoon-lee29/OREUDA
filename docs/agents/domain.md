# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `CONTEXT-MAP.md` if it exists.
- Relevant ADRs under `docs/adr/`.

If these files do not exist, proceed silently. Domain-modeling skills create them lazily when terms or decisions are resolved.

## File structure

This repository uses the single-context layout:

/
├── CONTEXT.md
├── docs/adr/
└── src/

## Use the glossary's vocabulary

Use terms defined in `CONTEXT.md`. Avoid synonyms the glossary explicitly rejects.

## Flag ADR conflicts

Explicitly surface output that contradicts an existing ADR rather than silently overriding it.
