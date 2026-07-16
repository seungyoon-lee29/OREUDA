# High-risk execution gates

This project uses the high-risk profile.

- Fail closed when authorization, configuration or dependency state is uncertain.
- Keep secrets out of logs, queues, fixtures and Git.
- Test permission boundaries, idempotency, concurrency and recovery paths.
- Test migrations on fresh apply, reapply and rollback where applicable.
- Require explicit opt-in for external messaging, deployment, billing and destructive mutations.
- Run secret scans and staged-file allowlist checks before commit.
- Require multi-perspective review for authentication, credentials, financial mutation, privacy and irreversible architecture changes.

