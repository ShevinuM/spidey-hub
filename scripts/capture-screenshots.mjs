// Documentation screenshot capture — writes docs/screenshots/*.png from a
// REAL (non-fixture) `pnpm build`: real submodule repos, real personnel
// content, and the real live-generated contribution grid, not the
// deterministic fixture content the visual-regression goldens use.
//
// Deliberately standalone rather than reusing
// tests/visual/pipeline.mjs's `captureState()`: that pipeline's whole job is
// PIXEL-IDENTICAL determinism for goldens — it installs a fake clock frozen
// at a fixed instant, pre-seeds the toast pick, and pre-sets the boot-skip
// flag before every capture. All three of those are exactly what this
// script does NOT want (live clock, live toast pool, a real mid-boot
// frame), so forcing reuse would mean immediately overriding most of what
// captureState sets up. What IS reused: the proven keystroke sequences from
// tests/visual/recipes.ts (`RecipeAction[]`) — the same sequences the visual
// suite already verified reach each named state — so this script can't
// silently drift from the app's real keybindings. See PLAN.md Phase I1 for
// the sanctioned-deviation note.
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "../common/tests/ui/support/static-server.mjs";
import { BOOT_SEEN_STORAGE_KEY } from "../src/features/boot/lib/boot-state.ts";
import { recipes, extraRecipes, iteration3Recipes } from "../common/tests/ui/support/recipes.ts";
import { pickPort } from "./lib/freePort.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, "docs/screenshots");
// PLAN.md Phase 7.4: was a hardcoded `4323`, which silently collided with
// a running `astro dev` (Astro falls back to 4322/4323/... when 4321 is
// taken). Resolved dynamically in main() via pickPort() instead.
const PREFERRED_PORT = 4323;
let PORT;
const VIEWPORT = { width: 1512, height: 945 };

/** Look up a recipe's `actions` by name across every recipe array. */
function actionsOf(name) {
  const recipe = [...recipes, ...extraRecipes, ...iteration3Recipes].find((r) => r.name === name);
  if (!recipe) throw new Error(`no recipe named ${name} in common/tests/ui/support/recipes.ts`);
  return recipe.actions;
}

async function runActions(page, actions) {
  for (const action of actions) {
    if ("key" in action) await page.keyboard.press(action.key);
    else await page.keyboard.type(action.type);
  }
}

/**
 * Captures one named screenshot into OUT_DIR. Every non-boot shot skips the
 * boot sequence via the same sessionStorage flag the real app checks
 * (BOOT_SEEN_STORAGE_KEY), waits for the dashboard wordmark to prove the
 * keydown listener is attached (the one piece of captureState's contract
 * worth keeping — see this file's header), replays `actions`, then settles
 * on fonts + network idle before screenshotting. `boot: true` skips all of
 * that and just waits real wall-clock `waitMs` into a fresh, un-skipped
 * boot sequence — no clock control needed, this is a doc image, not a
 * pixel-gated golden.
 */
async function shot(context, name, { boot = false, actions = [], waitMs = 0, waitSelector } = {}) {
  const page = await context.newPage();
  if (!boot) {
    await page.addInitScript((key) => sessionStorage.setItem(key, "1"), BOOT_SEEN_STORAGE_KEY);
  }
  await page.goto(`http://localhost:${PORT}/`);
  if (boot) {
    await page.waitForTimeout(waitMs || 2000);
  } else {
    await page.waitForSelector('[data-testid="dashboard-wordmark"]');
    await runActions(page, actions);
    if (waitSelector) await page.waitForSelector(waitSelector, { timeout: 5000 }).catch(() => {});
    if (waitMs) await page.waitForTimeout(waitMs);
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), animations: "disabled", caret: "hide" });
  await page.close();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log("[capture-screenshots] pnpm build (real content)...");
  execSync("pnpm build", { cwd: ROOT, stdio: "inherit" });

  const picked = await pickPort(PREFERRED_PORT);
  PORT = picked.port;
  if (!picked.usedPreferred) {
    console.log(
      `[capture-screenshots] port ${PREFERRED_PORT} is already in use (e.g. a running ` +
        `\`astro dev\`) — using ${PORT} instead`,
    );
  }

  const server = await serveStatic(join(ROOT, "dist"), PORT);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });

  try {
    // Dashboard's seeded toast pair auto-dismisses at 4000ms (real clock,
    // no seed pinned here) — wait past that so the shot isn't randomly
    // toast-contaminated.
    await shot(context, "dashboard", { waitMs: 4700 });
    await shot(context, "repositories", {
      actions: actionsOf("02-repositories"),
      waitSelector: '[data-testid="repositories-panel-1"]',
    });
    await shot(context, "employment-records", {
      actions: actionsOf("04-employment-l0"),
      waitSelector: '[data-testid="employment-row"]',
    });
    await shot(context, "profile", {
      actions: actionsOf("07-profile"),
      waitSelector: '[data-testid="profile-dossier"]',
    });
    await shot(context, "help", {
      actions: actionsOf("11-help"),
      waitSelector: '[data-testid="help-title"]',
    });
    await shot(context, "notifications-panel-open", {
      actions: [{ key: "n" }],
      waitSelector: '[data-testid="notifications-panel"]',
      waitMs: 300,
    });
    await shot(context, "shell", { actions: actionsOf("16-shell") });
    await shot(context, "editor", {
      actions: actionsOf("06-editor"),
      waitSelector: '[data-testid="editor-scroller"]',
    });
    await shot(context, "grep-overlay", {
      actions: actionsOf("10-grep-query"),
      waitSelector: '[data-testid="grep-overlay"]',
    });
    await shot(context, "choose-tree", { actions: actionsOf("19-choose-tree") });
    // No recipe covers copy-mode (it has no visual golden) — same "arm,
    // then the following key alone" tmux prefix shape every other prefixed
    // recipe above uses, opened over Profile for a more informative shot.
    await shot(context, "copy-mode", {
      actions: [
        { key: "Control+b" },
        { key: "4" },
        { key: "Control+b" },
        { key: "[" },
      ],
      waitSelector: '[data-testid="copy-mode-overlay"]',
    });
    await shot(context, "boot-mid", { boot: true, waitMs: 2000 });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`[capture-screenshots] wrote docs/screenshots/*.png`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
