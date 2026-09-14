// `pnpm goldens` regenerates tests/visual/goldens/<viewport>/<state>.png from
// the vendored, network-independent reference/ using pipeline.mjs and this
// file's 10-recipe `recipes` array (10 recipes x 2 viewports = 20 PNGs).
//
// HISTORICAL / GUARDED: tests/visual/goldens/ is now self-baselined against
// our own implementation across all 21 recipes / 42 goldens (see
// README-PIPELINE.md), not the vendored prototype this script still reads
// from — running it for real would overwrite those self-baselines with
// prototype screenshots and undo intentional implementation deviations, so
// it refuses to run without an explicit override flag naming what it does.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "./static-server.mjs";
import { recipes, viewports } from "./recipes.ts";
import { captureState } from "./pipeline.mjs";

const RESTORE_PROTOTYPE_PARITY_FLAG = "--restore-prototype-parity";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = path.join(__dirname, "../../../../../reference");
// Points at the root tests/visual/goldens/ tree, not the per-context split,
// since this script is historical/guarded.
const GOLDENS_DIR = path.join(__dirname, "../../../../../tests/visual/goldens");
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
