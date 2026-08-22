# Testing — index

Rules shared by all three suites (`unit-testing.md`, `e2e-testing.md`, `visual-testing.md`) live here so no rule has two homes. Each suite file opens with its own admission rule for what belongs there; this file is what's left once admission is decided.

| file | covers |
|---|---|
| `unit-testing.md` | Pure, DOM-free logic: `common/engines/`, `common/lib/`, a feature's own `lib/*.ts` and state-class methods. |
| `e2e-testing.md` | User-observable flow in a real browser: page objects, locators-in-practice, animation/overflow/cold-boot behavioral assertions. |
| `visual-testing.md` | Rendered appearance via golden pixel comparison: fixture-driven recipes, adversarial layouts, the rebaseline policy. |

## Where test code lives

- [ ] **R001** Each feature's tests live inside that feature's own `tests/` folder: `tests/unit/` for `node --test` logic, and `tests/ui/{e2e,visual}/` for the two Playwright-driven suites, grouped under `ui/` because both need a browser and both share page objects/fixtures (`e2e-testing.md` R010) — never as an unmarked file inside `components/`/`lib/`. The root `tests/` folder holds only cross-feature checks: the smoke tier under `tests/ui/smoke/` (see `e2e-testing.md`) and the coverage/boundary audits under `tests/audits/` (see "Root-level audits" below, not Playwright-driven so it stays outside `ui/`) — never a feature-specific spec.
- [ ] **R002** Shared fixtures, harnesses, and test-only helpers for the UI suites live in a `tests/ui/support/` folder at the level they're shared from (a feature's own `tests/ui/support/` if only that feature needs them, `common/tests/ui/support/` if more than one does) — never duplicated per consumer.
- [ ] **R003** Never export fixtures from a test file — importing one test file from another re-registers its suites.

## Cross-suite discipline

- [ ] **R004** A pure signature/relocation refactor with no behavior change needs no new tests in any suite — the type checker (for logic) and unchanged goldens (for rendering) are the proof. Don't add a test purely to document that a file moved.
- [ ] **R005** When a test exposes real misbehavior, fix the implementation, not the test — in any suite.
- [ ] **R006** Unhappy paths (empty states, boundary values, malformed content, an empty repository, an overflowing record) carry at least equal weight to happy paths in every suite.
- [ ] **R007** Every time a bug surfaces — self-found or reported — write a test that covers it, preferring the lowest level that can reach it: a unit test if the bug is reachable that way, otherwise e2e. Land the fix together with that reproducing test and any fixture data needed to reproduce it, in the same commit.
- [ ] **R008** Prove a new architecture/fitness rule isn't passing vacuously: fire it against a synthetic violation first, watch it fail, then trust it.

## Root-level audits

- [ ] **R009** The root `tests/` folder audits that every feature has, for each scenario it declares, a unit test where the logic is pure, an e2e test for the user-observable behavior, and a visual recipe for its rendered states. This audit needs a per-feature manifest enumerating scenarios to check against — without one there's nothing concrete to diff test files against.
- [ ] **R010** The root suite also owns the boundary fitness tests from `../general/architecture.md` (no-feature-imports-feature, etc.) — a feature's own test folder never re-implements these.
