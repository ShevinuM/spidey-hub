// `pnpm goldens` — regenerates tests/visual/goldens/<viewport>/<state>.png
// from the vendored, network-independent reference (tests/visual/reference)
// using the exact same capture pipeline (tests/visual/pipeline.mjs) and
// state recipes (tests/visual/recipes.ts) that tests/visual/identical.spec.ts
// also replays against the real implementation.
//
// 10 recipes x 2 viewports = 20 PNGs.
//
// PLAN.md Phase 6 item 6.1 — HISTORICAL / GUARDED: as of the Phase 6
// re-baseline (`playwright test tests/visual/identical.spec.ts
// --update-snapshots`, see tests/visual/README-PIPELINE.md), the goldens in
// tests/visual/goldens/ are SELF-baselines — captured from, and compared
// against, our OWN implementation, at all 15 recipes (30 goldens; this
// script's 10-recipe vendored-prototype path cannot even attempt the other
// 5, which reach states — the help window, all-projects, the boot sequence,
// the cmdline box — the prototype predates entirely). Running this script
// would silently overwrite those self-baselines with screenshots of the
// (frozen, unpatched) vendored PROTOTYPE instead, un-fixing the intentional
// deviations documented throughout this codebase (e.g. the tracker
// window-ordering bug fix) and reintroducing a structural mismatch that
// tests/visual/identical.spec.ts would then fail against. `pnpm goldens`
// is kept only as a historical record of how the ORIGINAL Phase 1 baseline
// was produced — running it for real (rather than reading it) requires an
// explicit override flag that names what it does, so nobody fat-fingers
// `pnpm goldens` expecting a self-baseline refresh and silently regresses
// the whole suite's authority.
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
const GOLDENS_DIR = path.join(__dirname, "goldens");
const PORT = 4400;

function hasOverrideFlag() {
  return process.argv.includes(RESTORE_PROTOTYPE_PARITY_FLAG);
}

async function main() {
  if (!hasOverrideFlag()) {
    console.error(
      [
        "refusing to run: tests/visual/goldens/ is now self-baselined from our",
        "own implementation (PLAN.md Phase 6 re-baseline, see this file's",
        "header comment) — running this script overwrites those 30 self-",
        "baselines with 20 screenshots of the frozen vendored prototype,",
        "un-fixing intentional deviations and desyncing tests/visual/",
        "identical.spec.ts's 15-recipe suite.",
        "",
        "To re-baseline for real (the normal path), run instead:",
        "  pnpm build:fixtures && playwright test tests/visual/identical.spec.ts --update-snapshots",
        "",
        "If you specifically intend to restore prototype parity (rare —",
        "reverting to the historical Phase 1 baseline), acknowledge that by",
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
        // implementation side (Phase 3's identical.spec.ts) will need.
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
