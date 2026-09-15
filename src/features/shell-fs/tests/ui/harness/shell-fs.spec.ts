// Harness spec — proves Shell.svelte works alone in PANE mode, mounted at
// `/harness/shell-fs` against the FIXTURE fs index
// (`src/features/shell-fs/tests/ui/support/fs-index.json`), not the real
// generated one shell.spec.ts uses.
//
// Host mode is out of scope (see
// ShellFsHarness.svelte).
//
// Expected values are derived from the fixture
// plus the real `listDir`/`resolveCd` port and shell.yaml's templates,
// never hardcoded.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ShellFsPage } from "../pages/ShellFsPage";
import { listDir, type FsEntry } from "../../../../../common/lib/shell";

const FIXTURE_PATH = join(import.meta.dirname, "../support/fs-index.json");
const FIXTURE: FsEntry[] = (
  JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as { entries: FsEntry[] }
).entries;

interface ShellErrors {
  cdNoSuchDirTemplate: string;
}
const shellYaml = YAML.parse(
  readFileSync(join(import.meta.dirname, "../../../content/shell.yaml"), "utf8"),
) as {
  homeLabel: string;
  errors: ShellErrors;
};

function rowsOf(segments: string[]): string[] {
  return listDir(FIXTURE, segments).map((e) => e.name + (e.type === "dir" ? "/" : ""));
}

test.describe("Shell-fs harness: mounts standalone (pane mode) with seeded fixture props", () => {
  test("mounts with the pane prompt visible and no output lines yet", async ({ page }) => {
    const shell = new ShellFsPage(page);
    await shell.openHarness();

    await expect(shell.prompt).toBeVisible();
    await expect(shell.lines).toHaveCount(0);
  });

  test("typing renders into the input line", async ({ page }) => {
    const shell = new ShellFsPage(page);
    await shell.openHarness();

    await page.keyboard.type("ls");
    await expect(shell.input).toHaveText("ls");

    await page.keyboard.press("Backspace");
    await expect(shell.input).toHaveText("l");
  });

  test("ls at the root lists the real fixture's top-level entries", async ({ page }) => {
    const shell = new ShellFsPage(page);
    await shell.openHarness();

    await page.keyboard.type("ls");
    await page.keyboard.press("Enter");

    const rows = rowsOf([]);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      await expect(shell.lines.filter({ hasText: row })).toHaveCount(1);
    }
  });

  test("cd into a real subdirectory changes the prompt path, and ls there lists its children", async ({
    page,
  }) => {
    const shell = new ShellFsPage(page);
    await shell.openHarness();

    await page.keyboard.type("cd src");
    await page.keyboard.press("Enter");
    await expect(shell.prompt).toHaveText(/\/src\b/);

    await page.keyboard.type("ls");
    await page.keyboard.press("Enter");
    const rows = rowsOf(["src"]);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      await expect(shell.lines.filter({ hasText: row })).toHaveCount(1);
    }
  });

  test("cd into a path that doesn't exist prints the real error template", async ({ page }) => {
    const shell = new ShellFsPage(page);
    await shell.openHarness();

    await page.keyboard.type("cd nope-this-does-not-exist");
    await page.keyboard.press("Enter");

    const expected = shellYaml.errors.cdNoSuchDirTemplate.replace(
      "{path}",
      "nope-this-does-not-exist",
    );
    await expect(shell.lines.filter({ hasText: expected })).toHaveCount(1);
  });

  test("ArrowUp restores the previous submitted line into history", async ({ page }) => {
    const shell = new ShellFsPage(page);
    await shell.openHarness();

    await page.keyboard.type("pwd");
    await page.keyboard.press("Enter");
    await expect(shell.lines).toHaveCount(2);
    await expect(shell.lines.last()).toHaveText(shellYaml.homeLabel);

    await page.keyboard.press("ArrowUp");
    await expect(shell.input).toHaveText("pwd");
  });
});
