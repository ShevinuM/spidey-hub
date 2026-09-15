# Visual test suite structure

How golden-image test code is organized across the feature-context rewrite, and how that maps onto Playwright's `projects` mechanism. The checkable rules this doc explains live in `../../rules/testing/visual-testing.md` and `../../rules/tech-stack/playwright.md`; on any disagreement between this doc and the rules, fix both in the same change rather than trusting one over the other.

## Folder structure

```
src/
  features/
    <feature>/
      tests/
        ui/                       everything Playwright-driven for this feature
          visual/
            <feature>.visual.spec.ts
            goldens/
              <viewport>/<recipe>.png
          e2e/
          pages/                  shared by e2e AND visual — see ../e2e/structure.md
            <Feature>Page.ts
          support/                shared fixtures/test data, also used by e2e
  common/
    tests/
      ui/
        pages/                    shared kernel-chrome page objects, same ones e2e uses
playwright.config.ts              root config — see "Playwright projects" below
```

Visual and e2e share `tests/ui/pages/` and `tests/ui/support/` as siblings — a visual spec never reaches _into_ `e2e/`'s own folder for a page object, because the page object was never e2e's to own in the first place; it belongs to the feature's UI tests generally. See `../e2e/structure.md` for the full rationale.

Each feature owns its own `goldens/` — never a shared top-level golden dump. A change to one feature's fixture data or markup should only ever touch that feature's own PNGs; if it touches another feature's, the fixtures weren't actually feature-local (see `../../rules/testing/visual-testing.md` R003).

## Playwright projects — visual is its own tier, not an e2e variant

Visual gets its own project per feature, scoped to that feature's `tests/ui/visual/` and run against a fixture build, distinct from that feature's e2e project even though both live under the same `tests/ui/` parent folder:

| project            | scope                                       | build it runs against                                                   |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------------------- |
| `<feature>-visual` | `src/features/<feature>/tests/ui/visual/**` | the fixture build (deterministic content, animations frozen at capture) |
| `<feature>` (e2e)  | `src/features/<feature>/tests/ui/e2e/**`    | the real build                                                          |

`pnpm exec playwright test --project=repositories-visual` runs only that feature's golden comparisons. Keeping visual and e2e as separate projects (rather than one project covering both kinds of spec) is what lets a feature's visual suite run against a different build than its e2e suite without either one contaminating the other's config (viewport, `animations: "disabled"`, base URL) — the shared `ui/` parent folder is purely organizational and doesn't change this.

## Reaching a state — reuse the shared page object, keep the assertions visual

A visual recipe is not a second copy of an e2e flow. It reuses the feature's `tests/ui/pages/` page object only to _navigate directly_ to the state it needs — never to replay a multi-step user journey:

```ts
import { test, expect } from "@playwright/test";
import { RepositoriesPage } from "../pages/RepositoriesPage";

test("repositories: file preview, adversarial long file", async ({ page }) => {
  const repos = new RepositoriesPage(page);
  await repos.gotoFixtureState("long-file-preview"); // direct nav, not a click-through
  await expect(page).toHaveScreenshot("repositories-long-file-preview.png");
});
```

If reaching a state genuinely requires interaction Playwright's `goto` can't express (a keyboard shortcut with no direct URL), that's a signal the feature needs a dedicated fixture-seeded route/prop for it — not a license to replay the full e2e flow inside a visual spec (see `../../rules/testing/visual-testing.md` R002).

## Fixtures — feature-local and adversarial

Each feature's fixture data lives with that feature (not a shared top-level `fixtures/`), and it deliberately includes adversarial cases — an overflowing record, an unbroken long line, an empty collection — so clipping and empty-state bugs can't hide behind a small, always-comfortable dataset. See `../../rules/testing/visual-testing.md` R003–R004 for the exact requirement.

## Golden lifecycle

1. **Seed** — a feature's starting goldens come from its first accepted capture: run the feature's `<feature>-visual-<viewport>` projects with `--update-snapshots` against a rendering already visually verified correct, then commit the resulting PNGs. See `running-tests.md`'s "Rebaselining" section for the exact command sequence — seeding a brand-new feature's goldens follows the same steps as rebaselining an existing one.
2. **Compare** — every run diffs the current render against the seeded golden via Playwright's `toHaveScreenshot`, which uses pixelmatch as its comparator internally (`../../rules/tech-stack/playwright.md`'s "Screenshot comparison" section) — `threshold` decides what counts as a differing pixel, `maxDiffPixels`/`maxDiffPixelRatio` decide how many are tolerated, and this suite leaves both tolerance options at strict defaults rather than loosening them to paper over non-determinism.
3. **Rebaseline** — only in the same change as a deliberate visual change, never to make a refactor's diff pass. See `running-tests.md` for the exact command sequence.
