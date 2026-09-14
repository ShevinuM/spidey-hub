# Locator preference order

Locators that resolve through the accessibility tree or visible user-facing text survive markup churn. Locators that resolve through implementation details (CSS classes, DOM structure, XPath) break the moment a developer refactors a `<div>` — which happens constantly in a feature-context rewrite where components get relocated between features and `common/`.

The ranking below runs from most to least preferred. Pick the highest-ranked strategy that can uniquely and reliably identify the element — don't reach for #4 when #1 works. The checkable form of this ranking lives in `../../rules/tech-stack/playwright.md`.

> **Hard rule for generating tests:** if the element has no accessible role, no user-facing label/text, and no existing `data-testid` (steps 1–3 all fail), **add a `data-testid` to the component.** Never fall through to a CSS selector or XPath to work around a missing test hook. Step 4 is not a fallback — it's to be avoided at all costs, because it silently couples the test to markup that has no contract to stay stable.

## 1. `getByRole`

```ts
page.getByRole('button', { name: 'Reboot' });
```

Resolves through the accessibility tree — the same thing screen readers use. It's tied to what the element *is* (a button, a link, a checkbox) and its accessible name, not to markup. A `<button>` refactored into a styled `<div role="button">` still matches.

## 2. `getByLabel`, `getByPlaceholder`, `getByText`

```ts
page.getByPlaceholder('Search files');
page.getByText('No commits yet');
```

Resolves through user-facing text — what a real visitor reads on screen. Breaks only if the copy changes, which is a real content change worth a test update, not an incidental refactor.

## 3. `getByTestId`

```ts
page.getByTestId('repositories-repo-row');
```

Stable across markup and copy changes, but invisible to real users — it only exists for tests. Reach for this when an element has no accessible role or stable text: a repeated repo row, a decorative panel border, an icon-only status dot.

If the element doesn't have a `data-testid` yet, **add one to the component** rather than dropping to step 4. This is a component change, not a test workaround — a permanent, cheap hook that keeps every future test for this element off CSS/XPath entirely.

## 4. CSS selector / XPath — avoid at all costs

```ts
page.locator('.repositories-panel:nth-child(2) > .repo-row'); // never do this
```

This is not a fallback tier. If a locator ends up here, the correct fix is to add a `data-testid` and rewrite the locator to use step 3 instead — not to ship the CSS/XPath locator. It couples the test to implementation details — class names, DOM nesting, sibling order — that change for reasons unrelated to the feature under test, and it produces the most confusing possible failure: a test that breaks because someone reordered a `<div>` in an unrelated feature.

## Anti-patterns

- No locators built from generated/dynamic class names (a CSS-module hash, a Tailwind arbitrary-value class).
- No `nth-child`/`nth-of-type` chains to disambiguate elements — add a `data-testid` or use the element's real accessible name instead.
- No XPath unless every strategy above genuinely cannot express the query (e.g. "the ancestor of this text node").
