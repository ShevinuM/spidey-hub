// Mounts Repositories.svelte standalone against fixture data; only `all-projects` and `webbing-lab` have a real generated repo index, so no other fixture row is clicked expecting a populated tree.
import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RepositoriesPage } from "../pages/RepositoriesPage";

const FIXTURE_DIR = join(import.meta.dirname, "../support/repositories");
const FIXTURE_COMMITS_DIR = join(import.meta.dirname, "../support/commits");
const FIXTURE_CONTRIBUTIONS_JSON = join(import.meta.dirname, "../support/contributions.json");

/** Every `- name:` entry across fixture project docs — one row per entry in `state.flatRepos`, plus the virtual all-projects row counted separately. */
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

/** The all-projects virtual tree's rows: every fixture `.md` filename, sorted — matches `generateAllProjectsIndex()`'s shape. */
const ALL_PROJECTS_FILES = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort((a, b) => a.localeCompare(b));

test.describe("Repositories harness: mounts standalone with seeded fixture props", () => {
  test.beforeEach(async ({ context }) => {
    // Repositories mounts a live-commit fetch to api.github.com on mount; abort it so this suite never depends on network luck.
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
