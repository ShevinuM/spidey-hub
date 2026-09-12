// Harness spec — proves Shell.svelte itself works, mounted alone in PANE
// mode (no Terminal kernel, no tmux chrome, no window-level keydown routing
// beyond what ShellFsHarness.svelte itself reproduces) against
// `/harness/shell-fs` (fixture build only, seeded fixture props via
// ShellFsHarness.svelte — see that wrapper's own header comment for the one
// piece of Terminal keydown routing it reproduces).
//
// Deliberately NOT a copy of
// src/features/shell-fs/tests/ui/e2e/shell.spec.ts: that suite exercises
// this component through the real kernel/tmux engine against the real
// generated fs/grep/repo indexes — this file mounts standalone against the
// FIXTURE fs index (src/features/shell-fs/tests/ui/support/fs-index.json,
// served from `dist/generated/fs-index.json` by `build:fixtures`'s own `cp`
// step) and covers exactly: mount + the initial prompt, typing into the
// input line, `ls`'s real directory listing, `cd` into a real subdirectory
// and back out, a `cd` error for a path that doesn't exist, and
// Backspace/ArrowUp editing the input line — the feature's own core
// interactions, independent of the kernel. Host mode (`tmux new`/`attach`/
// `open <view>`) is out of scope here (see ShellFsHarness.svelte's own
// header comment on why).
//
// Every rendered row/message below is derived from the real fixture file
// plus the real `listDir`/`resolveCd` port and the real shell.yaml error
// templates (same "derive the expectation from the real source"
// convention grep's own harness spec uses), not hardcoded, so a future
// fixture or copy edit doesn't silently desync this suite from the truth
// it's supposed to check. Assertions are web-first throughout (playwright.md
// R002) — no CSS-selector reads, only page-object locators built from
// testids; the only non-retrying reads anywhere in this file are
// `readFileSync`ing the fixture/yaml to derive expected values, never used
// as an assertion themselves.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ShellFsPage } from "../pages/ShellFsPage";
import { listDir, type FsEntry } from "../../../../../common/lib/shell";

const FIXTURE_PATH = join(import.meta.dirname, "../support/fs-index.json");
const FIXTURE: FsEntry[] = (JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as { entries: FsEntry[] }).entries;

interface ShellErrors {
  cdNoSuchDirTemplate: string;
}
const shellYaml = YAML.parse(readFileSync(join(import.meta.dirname, "../../../content/shell.yaml"), "utf8")) as {
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

  test("cd into a real subdirectory changes the prompt path, and ls there lists its children", async ({ page }) => {
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

    const expected = shellYaml.errors.cdNoSuchDirTemplate.replace("{path}", "nope-this-does-not-exist");
    await expect(shell.lines.filter({ hasText: expected })).toHaveCount(1);
  });

  test("ArrowUp restores the previous submitted line into history", async ({ page }) => {
    const shell = new ShellFsPage(page);
    await shell.openHarness();

    await page.keyboard.type("pwd");
    await page.keyboard.press("Enter");
    // Waits for `pwd`'s echoed input line AND its real output line (2
    // total), not just the input clearing — `submit()` clears `input`
    // synchronously on Enter, before the async fs-index warm-up that
    // `runCommand` (and the history push it makes) waits on (see
    // Shell.svelte's own header comment on this exact ordering hazard).
    // Pressing ArrowUp before that output lands would race an empty
    // history.
    await expect(shell.lines).toHaveCount(2);
    await expect(shell.lines.last()).toHaveText(shellYaml.homeLabel);

    await page.keyboard.press("ArrowUp");
    await expect(shell.input).toHaveText("pwd");
  });
});
