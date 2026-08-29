// `pnpm goldens` — regenerates tests/visual/goldens/<viewport>/<state>.png
// from the vendored, network-independent reference (tests/visual/reference)
// using the exact same capture pipeline (tests/visual/pipeline.mjs) and
// state recipes (tests/visual/recipes.ts) that tests/visual/identical.spec.ts
// also replays against the real implementation.
//
// 10 recipes x 2 viewports = 20 PNGs.
//
// HISTORICAL / GUARDED: the goldens in
// tests/visual/goldens/ are SELF-baselines — captured from, and compared
// against, our OWN implementation (`playwright test
// tests/visual/identical.spec.ts --update-snapshots`, see
// tests/visual/README-PIPELINE.md), at all 20 recipes (40 goldens total;
// this script's 10-recipe vendored-prototype path cannot even attempt the
// other 10, which
// reach states — the help window, all-projects, the boot sequence, the
// cmdline box, real panes/layouts/choose-tree/sessions/shell, the `?`
// HelpSearch palette — the prototype predates entirely). Running this
// script would silently overwrite those self-baselines with screenshots of
// the (frozen, unpatched) vendored PROTOTYPE instead, un-fixing the
// intentional deviations documented throughout this codebase (e.g. the
// tracker window-ordering bug fix) and reintroducing a structural mismatch
// that tests/visual/identical.spec.ts would then fail against. `pnpm
// goldens` is kept only as a historical record of how the original
// baseline was produced — running it for real (rather than reading it)
// requires an explicit override flag that names what it does, so nobody
// fat-fingers `pnpm goldens` expecting a self-baseline refresh and silently
// regresses the whole suite's authority.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "./static-server.mjs";
import { recipes, viewports } from "./recipes.ts";
import { captureState } from "./pipeline.mjs";

const RESTORE_PROTOTYPE_PARITY_FLAG = "--restore-prototype-parity";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = path.join(__dirname, "reference");
// This script's own 10-recipe `recipes` array (see the header comment) only
// ever wrote into the single tests/visual/goldens/ tree that existed before
// 00-phases.md D21 started splitting goldens per context (phase 02 moved
// "06-editor" out to common/tests/ui/visual/goldens/, the first split of
// many). Left pointed at the pre-split location since this script is
// historical/guarded and was never updated to the new per-context split —
// running it for real against today's tree would need that rework first,
// on top of the existing override-flag guard below.
const GOLDENS_DIR = path.join(__dirname, "../../../../tests/visual/goldens");
const PORT = 4400;

function hasOverrideFlag() {
  return process.argv.includes(RESTORE_PROTOTYPE_PARITY_FLAG);
}

async function main() {
  if (!hasOverrideFlag()) {
    console.error(
      [
        "refusing to run: tests/visual/goldens/ is now self-baselined from our",
        "own implementation (see this file's",
        "header comment) — running this script overwrites those 40 self-",
        "baselines with 20 screenshots of the frozen vendored prototype,",
        "un-fixing intentional deviations and desyncing tests/visual/",
        "identical.spec.ts's 20-recipe suite.",
        "",
        "To re-baseline for real (the normal path), run instead:",
        "  pnpm build:fixtures && playwright test tests/visual/identical.spec.ts --update-snapshots",
        "",
        "If you specifically intend to restore prototype parity (rare —",
        "reverting to the historical original baseline), acknowledge that by",
        `re-running with the ${RESTORE_PROTOTYPE_PARITY_FLAG} flag:`,
        `  node tests/visual/capture-goldens.mjs ${RESTORE_PROTOTYPE_PARITY_FLAG}`,
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const server = await serveStatic(REFERENCE_DIR, PORT);
  const baseUrl = `http://localhost:${PORT}/Homepage.dc.html`;
  const browser = await chromium.launch();

  try {
    for (const viewport of viewports) {
      const outDir = path.join(GOLDENS_DIR, viewport.name);
      await mkdir(outDir, { recursive: true });

      for (const recipe of recipes) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        // Reference has no api.github.com calls, but abort it anyway so the
        // capture side enforces the same network-determinism rule the
        // implementation side (identical.spec.ts) will need.
        await page.route("**/api.github.com/**", (route) => route.abort());

        try {
          const png = await captureState(page, baseUrl, recipe);
          const outPath = path.join(outDir, `${recipe.name}.png`);
          await writeFile(outPath, png);
          console.log(`wrote ${path.relative(process.cwd(), outPath)}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
