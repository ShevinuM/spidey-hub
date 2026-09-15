# Rules

Rules for the feature-context rewrite of this repo: a static portfolio site (Astro + Svelte 5, no backend, no database, no auth, no API) organized as `features/common/bootstrap/scripts`. Each rule is numbered `R001`, `R002`, ... independently per file. No rule carries a review tag (`enforced`, `decision`, ...) — nothing here is mechanically enforced yet, so a tag claiming otherwise would misrepresent the repo's current state.

## `testing/` — what earns a test, per suite

Cross-suite rules (where test code lives, root-level audits) live in `testing/README.md`, which each suite file below builds on.

| file                        | covers                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `testing/README.md`         | Cross-suite rules and this section's index.                                                                                               |
| `testing/unit-testing.md`   | Pure, DOM-free logic: `common/engines/`, `common/lib/`, a feature's `lib/*.ts` and state-class methods.                                   |
| `testing/e2e-testing.md`    | User-observable flow in a real browser: page-object structure, naming/file placement, animation/overflow/cold-boot behavioral assertions. |
| `testing/visual-testing.md` | Rendered appearance via golden pixel comparison: fixture-driven coverage, adversarial layouts, the rebaseline policy.                     |

## `tech-stack/` — framework and tool specifics

| file                       | covers                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tech-stack/astro.md`      | Content-collection loader/schema discipline, image optimization (`astro:assets`), islands hydration.                                                                                                                                                       |
| `tech-stack/svelte.md`     | Rune-level rules: `$state` vs `$state.raw`, `$effect` teardown, prop-mutation patterns (`$bindable`, callback props), component test wrappers.                                                                                                             |
| `tech-stack/typescript.md` | Compiler flags beyond `strict`, discriminated-union/narrowing discipline, type modelling, import hygiene.                                                                                                                                                  |
| `tech-stack/tailwind.md`   | v4's CSS-first `@theme` configuration and arbitrary-value/utility-class discipline.                                                                                                                                                                        |
| `tech-stack/playwright.md` | Playwright-API mechanics: locator ranking, web-first assertions, no arbitrary waits, fixtures and context isolation, and the screenshot-comparison options (`threshold` vs. `maxDiffPixels`/`maxDiffPixelRatio`) that configure pixelmatch under the hood. |

## `general/` — cross-cutting conventions

| file                                | covers                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `general/architecture.md`           | The `features/common/bootstrap/scripts` skeleton, the dependency rule, how a feature context is discovered and drawn, rule-of-three, cross-feature communication via a published surface.          |
| `general/files-and-naming.md`       | File/type-locality rules, when a type earns its own file, the Svelte orchestrator-component + state-class folder pattern, and the per-feature `data-testid` prefix convention.                     |
| `general/classes.md`                | When to reach for a class vs. a plain type, encapsulation, construction invariants, member order, error messages.                                                                                  |
| `general/comments.md`               | What earns a comment, the two kinds of comment, TODO discipline, commented-out code, one-sentence length/format discipline, the phone test, and the ban on legacy/prior-implementation references. |
| `general/toolchain.md`              | Compiler/gate/formatting discipline and commit-message convention. Three items marked open.                                                                                                        |
| `general/design-mirror.md`          | The Claude Design page-mirror export (`ds-bundle/`) carried over from v1: generation mechanics, self-containment rules, and the push procedure.                                                    |
| `general/documentation-practice.md` | How these rules and other project docs stay accurate as the codebase changes.                                                                                                                      |
