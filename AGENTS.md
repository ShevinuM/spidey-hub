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
- [`docs/agent-checklist.md`](docs/agent-checklist.md) - ruleset for the project.

- Before making a change read docs/agent-checklist.md and after making changes, all changes must pass 100% against docs/agent-checklist.md.
