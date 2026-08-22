# Toolchain & tooling

The compiler, gates, formatters, and scripts. Items marked `open` are not yet decided.

## Compiler & gates

- [ ] **R001** TypeScript runs in `strict` mode from the first commit — write code that satisfies it rather than loosening a flag per file.
- [ ] **R002** Playwright is pinned to an exact version (no `^`) — the visual goldens are only valid for the exact Chromium build that captured them; bumping the pin requires a re-baseline in the same change.
- [ ] **R003** A single combined type/lint gate (Astro's own check + `tsc --noEmit` + `svelte-check`) runs clean before any change is declared done.
- [ ] **R004** Unit tests run on Node's built-in test runner (`node --test`) over pure `lib`/`engine` modules only — no DOM, no browser dependency, so this suite stays fast. A module a unit test imports directly must stay DOM-free and rune-free.
- [ ] **R005** e2e and visual suites run through Playwright against a real (or fixture) build — never assert against dev-server-only behavior.
- [ ] **R006** Never wrap a checker in a `... | grep || echo "clean"` pipeline — it silently masks a missing or failed command as a false pass.

## Scripts & formatting

- [ ] **R007** `package.json` scripts are the command itself — no `echo`/brace-group/shell-plumbing wrappers. When a tool can write its own output to a file, use its native flag, never a shell redirect.
- [ ] **R008** Formatting is delegated to one formatter and never hand-managed — run it, treat its output as authoritative.
- [ ] **R009** Invoke tools through `pnpm`, not `npx` or a globally installed binary.
- [ ] **R010** A fixture/env-flag build (an env var like `FIXTURES=1` that switches content sources for deterministic capture) is documented at the one place that reads it and never leaks into a normal dev/build run.

## Version control

- [ ] **R011** A commit message is single-line and imperative — no body, no trailer.
- [ ] **R012** One reviewable unit of work per commit.

## Open — settle before the first feature lands

- [ ] **R013** *(open)* Exact lint tool and rule set — decide whether to add ESLint/oxlint beyond `astro check`/`svelte-check`.
- [ ] **R014** *(open)* Whether relative TS imports need an explicit extension, and whether `exactOptionalPropertyTypes`/`verbatimModuleSyntax` are enabled — settle once and record here so no feature picks its own convention.
- [ ] **R015** *(open)* Whether the unit-test runner is `node --test` (zero extra dependency) or Vitest — decide before the first `common/engines/` module gets its tests.

The Claude Design mirror export workflow carries over from v1 — see `design-mirror.md` for its full spec (one item there is still open: the v2 project identity).
