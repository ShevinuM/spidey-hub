# Agent guide

Canonical documentation lives in `docs/`, not here — read it before making a
non-trivial change:

- [`docs/project-structure.md`](docs/project-structure.md) — repo layout,
  the content/data/generated convention, the component folder + state-class
  pattern.
- [`docs/architecture.md`](docs/architecture.md) — stack, Svelte 5 runes
  coding standards, testing gates, the golden rebaseline policy, fixture mode.
- [`docs/how-to-run.md`](docs/how-to-run.md) — every `pnpm` command, the
  `GITHUB_TOKEN` role, screenshot capture, fixtures.

Every code change follows [`AGENT_CHECKLIST.md`](AGENT_CHECKLIST.md) —
run it before considering any change done.

## Rule: docs/ and the checklist move together

**Whenever a file under `docs/` changes in a way that affects a convention,
gate, or naming rule, update `AGENT_CHECKLIST.md` in the same change.** The
checklist is a compressed index into `docs/`, not an independent source of
truth — a docs change that leaves the checklist saying something else is a
bug in the change, not a follow-up.

## Commit style

Single-line, imperative commit messages. No body, no trailer (no
`Co-Authored-By`, no footer). One reviewable unit of work per commit.

## Golden rebaseline policy

Visual goldens (`tests/visual/goldens/`) are self-baselines, not a fixed
external target — that's what makes them a real safety net for refactors.
**Never rebaseline a golden to make a refactor's diff pass.** Rebaseline
only in the same commit as a deliberate visual change, via the procedure in
`docs/how-to-run.md`, gated by three consecutive clean `pnpm test:visual`
runs and a manual look at every changed PNG.
