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

Every code change follows [`AGENT_CHECKLIST.md`](AGENT_CHECKLIST.md) — run
it before considering any change done. See `CLAUDE.md` for the commit-style
and golden-rebaseline rules that apply regardless of which agent/tool is
making the change.
