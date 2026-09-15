# Playwright

Playwright-API mechanics: locators, assertions, waiting, and fixture/context semantics. Testing _strategy_ — what earns an e2e vs. a visual test, the page-object structure, file placement — lives in `../testing/e2e-testing.md` and `../testing/visual-testing.md`.

## Locators

- [ ] **R001** Use the highest-ranked strategy that uniquely and reliably identifies the element: (1) `getByRole` when the element has an accessible role and name, (2) `getByLabel`/`getByPlaceholder`/`getByText` for user-facing text when no role fits, (3) `getByTestId` only when the element has no accessible role and no stable user-facing text (an icon-only button, a repeated list row, a decorative container). Never drop to a lower rank when a higher one already works.
- [ ] **R002** No CSS selectors or XPath, ever — not even as a fallback. If ranks 1–3 all genuinely fail, add a `data-testid` to the component and locate against it with `getByTestId`, rather than reaching for `page.locator('.some-class')`.
- [ ] **R003** Call `getByTestId(...)`, never `page.locator('[data-testid="..."]')` — they resolve to the same element, but the helper is the one strategy #3 actually names, and a raw attribute-selector string is one keystroke away from silently becoming a full CSS selector later.
- [ ] **R004** No locator built from a generated/dynamic class name (a CSS-module hash, a Tailwind arbitrary-value class) and no `nth-child`/`nth-of-type` chain to disambiguate elements — add a `data-testid` or use the element's real accessible name instead.

## Assertions & waiting

- [ ] **R005** Use web-first assertions (`await expect(locator).toHaveText(...)`, `.toBeVisible()`, etc.) — they auto-retry until the condition holds or the timeout elapses. Never assert on a value read once via a non-retrying call (`locator.textContent()` followed by a plain `expect(text).toBe(...)`) where a web-first form exists.
- [ ] **R006** Never add an arbitrary `page.waitForTimeout(...)` to "let something settle" — every wait is either an actionability check Playwright already performs automatically before an action, or a specific, named condition (`waitForResponse`, a web-first assertion on the thing that must appear) that says what it's actually waiting for.
- [ ] **R007** Use `force: true` only with a comment explaining why the normal actionability checks are wrong for this specific action — it's an escape hatch, not a way to make a flaky click pass.

## Fixtures & context isolation

- [ ] **R008** Each test gets a fresh, isolated browser context by default (Playwright's own built-in guarantee) — never opt into context reuse (`reuseContext`) for a real e2e spec; that trade is for component-test galleries only, and its isolation is explicitly best-effort (permissions, geolocation overrides, and browsing history are NOT reset between reused-context tests).
- [ ] **R009** Shared per-feature setup (seeding a fixture build, navigating to a common starting view) is extracted into a custom fixture via `test.extend`, not copy-pasted at the top of every spec in a file — this is the mechanism behind the per-feature `tests/ui/support/` helpers `../testing/README.md` R002 already calls for.

## Screenshot comparison

`toHaveScreenshot`/`toMatchSnapshot` use pixelmatch as their comparator internally — there's no separate library to install or call by hand, only Playwright's own `expect` options to configure.

- [ ] **R010** `threshold` and `maxDiffPixels`/`maxDiffPixelRatio` are different knobs, not interchangeable: `threshold` (0–1, compared in YIQ color space) controls how different two pixels' _colors_ must be before they count as differing at all; `maxDiffPixels`/`maxDiffPixelRatio` controls how many already-counted differing pixels the whole comparison tolerates before failing. Per `../testing/visual-testing.md`'s self-baseline policy, leave both tolerance options unset (effectively zero) rather than widening either to make a flaky golden pass — see that file's R007 for why a wider tolerance hides non-determinism instead of fixing it.
- [ ] **R011** On a failed screenshot assertion, read the generated diff image before the differing-pixel count — a small `maxDiffPixels` overage can be one solid mis-rendered region (a real bug) or scattered single-pixel noise across the page (usually a determinism problem, not a rendering one), and only the image tells you which.
