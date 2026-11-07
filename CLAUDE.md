## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on mwe-dexpro/Grilled-Heads-Up (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## UI reference
Visual design: docs/design/README.md + docs/design/screenshots/.
Match the look; CONTEXT.md and docs/v1-scope.md win on terms and behaviour.
Open gaps: docs/design/ALIGNMENT.md.

## Commits and pull requests
Don't add AI attribution to commit messages, pull request descriptions or issues: no `Co-Authored-By` trailer for Claude or any other AI, no "Generated with …" line, no AI signature or session link.

## Test and security quality bar
What "done" means for tests and security: [docs/agents/testing.md](docs/agents/testing.md). Tests for the happy path, the error paths and the edge cases that fail when the code is broken; no weakened test, threshold or security check; no new `any`, `as`, `!` or `eslint-disable`.
Before pushing, run `npm run typecheck`, `npm run lint` and `npm run test:unit` (zero warnings); the other commands are listed there.
