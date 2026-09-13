# Page object model conventions

The checkable form of every rule below lives in `../checklist/testing/e2e-testing.md`. This doc is the rationale and the worked example.

## Locators

Prefer accessibility-based selectors over CSS — see `locator-preference.md` for the full ranking. Expose locators as getters, not fields, so they resolve lazily on access rather than at construction time:

```ts
class RepositoriesPage {
  constructor(private readonly page: Page) {}

  get repoRow() {
    return (name: string) => this.page.getByTestId('repositories-repo-row').filter({ hasText: name });
  }

  get filesPanel() {
    return this.page.getByTestId('repositories-panel-2');
  }
}
```

A constructor that assigns locators to fields (`this.repoRow = page.locator('#repo-row')`) resolves the element immediately, before it may even exist in the DOM, and it's the pattern that quietly invites a CSS selector — the getter form is what keeps both problems out.

Never expose raw locators to a spec — tests call page-object methods, not `page.locator(...)` directly. If a locator or UI piece is shared across features (the kernel chrome — a status bar, a shared overlay), extract it into a page-object class living under `src/common/tests/ui/pages/` and compose it into each feature's page object as a property, rather than redefining the same locator per feature.

A page object itself lives in `tests/ui/pages/` — a sibling of `tests/ui/e2e/` and `tests/ui/visual/`, not nested inside either, since both suites use the same page objects to reach the states they assert on (see `structure.md`).

## Methods

Keep action methods atomic — one logical interaction per method:

```ts
async openRepo(name: string) {
  await this.repoRow(name).click();
}

async expandTree(entryName: string) {
  await this.treeRow(entryName).click();
}
```

Not a combined multi-step method (`openRepoAndExpandFirstFileAndAssertPreview()`) — when a test fails partway through a combined method, it's unclear which step actually broke.

Assertions belong in tests, not page objects. The one exception is a convenience method whose name states the expected outcome:

```ts
async expectRepoOpened(name: string) {
  await expect(this.filesPanel).toContainText(name);
}
```

Action methods are verb-based camelCase (`openRepo`, `expandTree`, `submitSearch`).

## Naming

- Page-object files: PascalCase (`RepositoriesPage.ts`).
- Locator getters: camelCase (`repoRow`, `filesPanel`).
- Spec files: kebab-case (`repositories.spec.ts`).

## Anti-patterns

- No "god" page object — if a class approaches a few dozen methods, split it into smaller component classes (one per panel is a natural split for a feature like `repositories`).
- No shared state between tests — each test builds its own state via its page object and fixtures, never depending on state a previous test left behind.
