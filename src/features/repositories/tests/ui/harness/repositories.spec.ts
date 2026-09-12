// Harness spec — proves Repositories.svelte itself works, mounted alone (no
// Terminal kernel, no tmux chrome, no PaneTree-owned focus/refs routing)
// against `/harness/repositories` (fixture build only, seeded fixture props
// via RepositoriesHarness.svelte — see that wrapper's own header comment
// for the one piece of Terminal/PaneTree keydown routing it reproduces).
//
// Deliberately NOT a copy of
// src/features/repositories/tests/ui/e2e/repositories.spec.ts: that suite
// exercises this view through the real kernel and the real 8-repo content
// tree — this file mounts standalone against the FIXTURE repositories tree
// (src/features/repositories/tests/ui/support/repositories, self-switched
// by content.config.ts's own `base:` ternary under PORTFOLIO_FIXTURES=1)
// and covers exactly: mount + repo-row rendering, the all-projects tree
// already populated on mount, selecting a file rendering its preview lines,
// selecting a repo swapping the commits panel to its fixture snapshot, and
// the status panel's contribution grid — the feature's own core
// interactions, independent of the kernel.
//
// Only two of the fixture repos are backed by a real `/generated/repos/*.json`
// index — `all-projects` (the virtual repo, always selected on mount) and
// `webbing-lab` (the adversarial empty-repo case, covered by
// adversarial-fixtures.spec.ts) — every other fixture repo row exists only
// to prove the repo LIST/branch/commits-panel rendering, not a working-tree
// fetch; this suite does not click one expecting a populated tree (see
// commits.ts's own fixture-mechanism header comment for why only certain
// repos carry a working-tree snapshot).
//
// Repo count is derived from the real fixture `.md` frontmatter on disk
// (same "derive the expectation from the real source" convention the
// ported e2e suite and employment's own harness spec use), not hardcoded,
// so a future fixture edit doesn't silently desync this suite from the
// truth it's supposed to check. Assertions are web-first throughout
// (Mechanics 5b, playwright.md R002) — no CSS-selector reads (including
// inside `page.evaluate()`), only page-object locators built from testids
// and visible text.
import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RepositoriesPage } from "../pages/RepositoriesPage";

const FIXTURE_DIR = join(import.meta.dirname, "../support/repositories");
const FIXTURE_COMMITS_DIR = join(import.meta.dirname, "../support/commits");
const FIXTURE_CONTRIBUTIONS_JSON = join(import.meta.dirname, "../support/contributions.json");

/** Every `- name: <repo>` entry under every fixture project doc's `repos:`
 * frontmatter list — the real flat repo count `state.flatRepos` renders,
 * one row per entry across every fixture `.md` file (plus the virtual
 * all-projects row, counted separately below). */
function fixtureRepoNames(): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(FIXTURE_DIR)) {
    if (!entry.endsWith(".md")) continue;
    const raw = readFileSync(join(FIXTURE_DIR, entry), "utf8");
    for (const m of raw.matchAll(/^\s*- name:\s*(\S+)/gm)) names.push(m[1]);
  }
  return names;
}

const REPO_NAMES = fixtureRepoNames();

/** The all-projects virtual tree's rows: one per fixture project doc,
 * matching `generateAllProjectsIndex()`'s `{path, lines}` shape (mirrored
 * verbatim by `all-projects-fixture.test.ts`) — every fixture `.md`
 * filename, sorted. */
const ALL_PROJECTS_FILES = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort((a, b) => a.localeCompare(b));

test.describe("Repositories harness: mounts standalone with seeded fixture props", () => {
  test.beforeEach(async ({ context }) => {
    // Repositories mounts a live-commit refresh island that hits
    // api.github.com on mount — abort it so this suite never depends on
    // network luck, same contract every ported e2e spec and
    // identical.spec.ts's own `beforeEach` already use.
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("panel [1] lists one row per fixture repo, all-projects pinned first", async ({ page }) => {
    const repositories = new RepositoriesPage(page);
    await repositories.openHarness();

    await expect(repositories.repoRows).toHaveCount(REPO_NAMES.length + 1);
    await expect(repositories.repoRows.first()).toHaveAttribute("data-all-projects", "true");
  });

  test("panel [2] shows the all-projects tree on mount — no click or keypress needed", async ({ page }) => {
    const repositories = new RepositoriesPage(page);
    await repositories.openHarness();

    await expect(repositories.treeRows).toHaveCount(ALL_PROJECTS_FILES.length);
    for (const name of ALL_PROJECTS_FILES) {
      await expect(repositories.treeRow(name)).toBeVisible();
    }
  });

  test("selecting a file in the all-projects tree renders its content in panel [3]", async ({ page }) => {
    const repositories = new RepositoriesPage(page);
    await repositories.openHarness();

    await repositories.treeRow("flerken-watch.md").click();

    const heading = readFileSync(join(FIXTURE_DIR, "flerken-watch.md"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("# "));
    expect(heading).toBeTruthy();
    await expect(repositories.previewText.filter({ hasText: heading! })).toBeVisible();
  });

  test("selecting a repo swaps panel [4] to that repo's fixture commit snapshot", async ({ page }) => {
    const repositories = new RepositoriesPage(page);
    await repositories.openHarness();

    await repositories.repoRow("flerken-watch").first().click();

    const snapshot = JSON.parse(readFileSync(join(FIXTURE_COMMITS_DIR, "flerken-watch.json"), "utf8")) as {
      sha8: string;
    }[];
    expect(snapshot.length).toBeGreaterThan(0);
    await expect(repositories.commitRows).toHaveCount(snapshot.length);
    await expect(repositories.commitRows.first()).toHaveAttribute("data-sha8", snapshot[0].sha8);
  });

  test("panel [0] renders a contribution-grid cell per fixture day", async ({ page }) => {
    const repositories = new RepositoriesPage(page);
    await repositories.openHarness();

    const { days } = JSON.parse(readFileSync(FIXTURE_CONTRIBUTIONS_JSON, "utf8")) as { days: unknown[] };
    await expect(repositories.contribCells).toHaveCount(days.length);
  });

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({ page }) => {
    const repositories = new RepositoriesPage(page);
    await repositories.openHarness();

    await expect(repositories.statusBar.windows).toHaveCount(0);
  });
});
