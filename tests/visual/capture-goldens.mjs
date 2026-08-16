// `pnpm goldens` — regenerates tests/visual/goldens/<viewport>/<state>.png
// from the vendored, network-independent reference (tests/visual/reference)
// using the exact same capture pipeline (tests/visual/pipeline.mjs) and
// state recipes (tests/visual/recipes.ts) that tests/visual/identical.spec.ts
// will replay against the real implementation from Phase 3 on.
//
// 10 recipes x 2 viewports = 20 PNGs.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "./static-server.mjs";
import { recipes, viewports } from "./recipes.ts";
import { captureState } from "./pipeline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = path.join(__dirname, "reference");
const GOLDENS_DIR = path.join(__dirname, "goldens");
const PORT = 4400;

async function main() {
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
