// `pnpm goldens` regenerates a scratch tests/visual/goldens/<viewport>/<state>.png
// tree from the vendored, network-independent reference/ using pipeline.mjs
// and this file's 10-recipe `recipes` array (10 recipes x 2 viewports = 20
// PNGs).
//
// GUARDED: the 42 committed goldens are the source of truth, self-baselined
// against our own implementation, and each context owns its own
// `tests/ui/visual/goldens/` directory per that project's
// `snapshotPathTemplate` (see README-PIPELINE.md).
//
// This script reads from the vendored prototype rather than the
// implementation, so its output is prototype parity, not a baseline — it
// refuses to run without an explicit override flag naming what it does.
//
// Its `GOLDENS_DIR` still targets the pre-split `tests/visual/goldens/`,
// which no longer exists on disk (the vestigial root runner that once read
// it was deleted) and which no Playwright project reads — running this
// script recreates the directory via `mkdir` but nothing consumes its
// output.
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
// Points at the deleted root tests/visual/goldens/ tree, not any
// per-context split, since this script is historical/guarded.
const GOLDENS_DIR = path.join(__dirname, "../../../../../tests/visual/goldens");
const PORT = 4400;

function hasOverrideFlag() {
  return process.argv.includes(RESTORE_PROTOTYPE_PARITY_FLAG);
}

async function main() {
  if (!hasOverrideFlag()) {
    console.error(
      [
        "refusing to run: every context/feature's own goldens are now",
        "self-baselined from our own implementation (see this file's",
        "header comment) — running this script writes 20 screenshots of the",
        "frozen vendored prototype into a scratch tests/visual/goldens/ tree",
        "that no Playwright project reads, and is not how any committed",
        "golden is produced.",
        "",
        "To re-baseline for real (the normal path), see",
        "docs/testing/visual/running-tests.md's \"Rebaselining\" section:",
        "  pnpm build:fixtures && playwright test --project=<feature>-visual-1512x945 --project=<feature>-visual-1920x1080 --update-snapshots",
        "",
        "If you specifically intend to restore prototype parity (rare —",
        "reverting to the historical original baseline), acknowledge that by",
        `re-running with the ${RESTORE_PROTOTYPE_PARITY_FLAG} flag:`,
        `  node src/common/tests/ui/support/capture-goldens.mjs ${RESTORE_PROTOTYPE_PARITY_FLAG}`,
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
