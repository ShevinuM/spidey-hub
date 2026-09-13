// Claude Design mirror generator (PLAN.md Phase 9.1/9.1b) — serializes each
// built page of the app into a self-contained `.dc.html` snapshot matching
// the format observed in `UI-Mockups/builds-page-design-review/Dashboard.dc.html`
// (gitignored, present on disk only — read it before changing this file).
//
// Sibling to scripts/capture-screenshots.mjs: reuses the same
// build+serveStatic+pickPort+boot-skip infrastructure. One deliberate
// deviation from that script's approach: capture-screenshots.mjs reaches
// each state by replaying tests/visual/recipes.ts keystrokes from the
// dashboard, because a documentation screenshot wants specific *non-default*
// states (a selected repo row, an opened editor). A design mirror wants each
// ROUTE's own default SSR state instead — and every one of the six routes
// below is already its own Astro page (src/pages/*.astro, each with its own
// `initialView`), so a direct `page.goto` to that route's URL reaches the
// exact same state a recipe chord would have navigated to, with less
// machinery and no dependency on keybindings unrelated to this script's job.
//
// Self-containment: a `.dc.html` opened via `file://` (or hosted standalone
// in Claude Design) cannot fetch anything at render time except a data: URI.
// Every same-origin reference the built HTML/CSS actually makes — every
// `public/assets/*.svg`/`*.jpg`, `public/fonts/*.woff2`, AND the
// build-hashed `/_astro/*.woff2`/`.woff` JetBrains Mono subset files Astro's
// font optimizer emits (NOT all of which it inlines itself — some subsets
// ship as external hashed files the CSS `@font-face` still points at) — gets
// inlined as a base64 data: URI. Discovered empirically: an early version
// of this script only inlined the known `public/` files and the Phase 9.1b
// gate caught 404s on 6 `/_astro/jetbrains-mono-latin-*` files the browser
// actually requested. Rather than hand-list every such build artifact, the
// inliner below fetches whatever the live server actually returns for any
// remaining `/`-absolute `url(...)`/`src="..."` reference and inlines that —
// correct by construction, not by an enumerated exception list.
//
// The one deliberate exception is `public/assets/retina-v.png` (2MB, used
// by Profile) — emitted as a sibling binary file under `assets/` next to the
// generated .dc.html and referenced by a relative path instead, per
// PLAN.md Phase 9's orchestrator decision. `public/assets/resume.pdf` is
// left as a relative link: it's an `<a href download>`, never fetched at
// render time, so it doesn't violate self-containment the way an
// auto-loaded asset would — clicking it from a standalone file just won't
// resolve, which is out of scope for this script.
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "../src/common/tests/ui/support/static-server.mjs";
import { BOOT_SEEN_STORAGE_KEY } from "../src/features/boot/lib/boot-state.ts";
import { pickPort } from "./lib/freePort.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_ROOT = join(ROOT, "ds-bundle");
const ASSETS_DIR = join(ROOT, "public/assets");
const RETINA_SIBLING_FILE = "retina-v.png";
const PREFERRED_PORT = 4324;
const VIEWPORT = { width: 1512, height: 945 };

/**
 * Six routes, each its own Astro page (src/pages/<x>.astro) with its own
 * `initialView` — a direct `goto` to `path` lands on that page's default
 * state. `extraWaitMs` on Dashboard mirrors capture-screenshots.mjs's own
 * comment: the seeded toast pair auto-dismisses at 4000ms on a live clock,
 * so waiting past that avoids randomly capturing a mid-dismiss toast — true
 * for both the real and fixture build, since neither pins the clock here
 * (only the visual-regression pipeline does that).
 */
const ROUTES = [
  { name: "Dashboard", path: "/", extraWaitMs: 4700 },
  { name: "repositories", path: "/repositories" },
  { name: "employment", path: "/employment" },
  { name: "profile", path: "/profile" },
  { name: "help", path: "/help" },
  { name: "retina-v", path: "/retina-v" },
];

const BUILDS = {
  real: { buildCmd: "pnpm build", outDir: "pages-real" },
  fixtures: { buildCmd: "pnpm build:fixtures", outDir: "pages-fixtures" },
};

/**
 * Fetches `path` from the live server (once per build, cached) and returns
 * it as a base64 data: URI, using the server's own `Content-Type` response
 * header rather than guessing from the extension — correct for both known
 * `public/` files and build-hashed `_astro/` artifacts alike.
 */
async function fetchAsDataUri(origin, path, cache) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(`${origin}${path}`);
  if (!res.ok) throw new Error(`generate-design-mirror: ${path} -> HTTP ${res.status}`);
  const mime = res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  const uri = `data:${mime};base64,${buf.toString("base64")}`;
  cache.set(path, uri);
  return uri;
}

// Matches an absolute-path reference inside `url(...)` (no quotes — neither
// this app's CSS/inline-style masks nor the reference mockup format ever
// quote one) or an `<img src="...">` attribute — deliberately NOT `href`:
// an anchor (the resume.pdf download link, any future internal nav link)
// is a user-initiated navigation, never fetched automatically at render
// time, so it's out of this script's self-containment scope (see module
// header). Excludes `data:` URIs (already inlined) and any path already
// rewritten to a relative sibling (e.g. `assets/retina-v.png`, no leading
// slash) by running before this pass.
const REMOTE_REF_RE = /url\((\/[^)'"]+)\)|src="(\/[^"]+)"/g;

/**
 * Rewrites every remaining same-origin absolute reference in `text` (CSS
 * text or serialized body markup) to a fetched-and-inlined data: URI.
 */
async function inlineRemoteRefs(text, { origin, cache }) {
  const paths = new Set();
  for (const m of text.matchAll(REMOTE_REF_RE)) paths.add(m[1] ?? m[2]);
  const replacements = new Map();
  for (const path of paths) {
    replacements.set(path, await fetchAsDataUri(origin, path, cache));
  }
  return text.replace(REMOTE_REF_RE, (whole, urlPath, attrPath) => {
    const path = urlPath ?? attrPath;
    const uri = replacements.get(path);
    return urlPath ? `url(${uri})` : `src="${uri}"`;
  });
}

/** In-page DOM surgery: strip every <script>, read the two stylesheet hrefs
 * (if any), and capture the hydrated attributes/markup needed to rebuild a
 * standalone document. Done in-page rather than by regexing the serialized
 * string afterward, so element boundaries are never guessed at.
 */
async function extractPage(page) {
  return page.evaluate(() => {
    const cssHrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) =>
      l.getAttribute("href"),
    );
    document.querySelectorAll("script").forEach((s) => s.remove());
    const attrsOf = (el) =>
      Array.from(el.attributes)
        .map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`)
        .join(" ");
    return {
      htmlAttrs: attrsOf(document.documentElement),
      bodyAttrs: attrsOf(document.body),
      bodyInner: document.body.innerHTML,
      cssHrefs,
    };
  });
}

async function fetchCss(origin, hrefs, cache) {
  const texts = [];
  for (const href of hrefs) {
    if (!href) continue;
    if (!cache.has(href)) {
      const res = await fetch(`${origin}${href}`);
      cache.set(href, await res.text());
    }
    texts.push(cache.get(href));
  }
  return texts.join("\n");
}

function assemble({ htmlAttrs, bodyAttrs, bodyInner }, css) {
  return `<!-- @dsCard group="Pages" -->
<!DOCTYPE html>
<html ${htmlAttrs}>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body ${bodyAttrs}>
<x-dc>
<helmet>
<style>
${css}
</style>
</helmet>
${bodyInner}
</x-dc>
</body>
</html>
`;
}

/**
 * Generates one build's mirror set into `ds-bundle/<outDir>/`.
 * `onlyRoute`, when set, restricts generation to the single named route —
 * used by the Phase 9.1b hard gate to prove Dashboard end to end before
 * spending time on the other five.
 */
async function generateBuild(buildKey, { onlyRoute } = {}) {
  const { buildCmd, outDir } = BUILDS[buildKey];
  const outPath = join(OUT_ROOT, outDir);
  mkdirSync(outPath, { recursive: true });
  mkdirSync(join(outPath, "assets"), { recursive: true });
  cpSync(join(ASSETS_DIR, RETINA_SIBLING_FILE), join(outPath, "assets", RETINA_SIBLING_FILE));

  console.log(`[generate-design-mirror] ${buildCmd} ...`);
  execSync(buildCmd, { cwd: ROOT, stdio: "inherit" });

  const picked = await pickPort(PREFERRED_PORT);
  const port = picked.port;
  if (!picked.usedPreferred) {
    console.log(`[generate-design-mirror] port ${PREFERRED_PORT} busy — using ${port} instead`);
  }
  const origin = `http://localhost:${port}`;
  const server = await serveStatic(join(ROOT, "dist"), port);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const cssCache = new Map();
  const assetCache = new Map();
  const written = [];

  try {
    const routes = onlyRoute ? ROUTES.filter((r) => r.name === onlyRoute) : ROUTES;
    for (const route of routes) {
      const page = await context.newPage();
      await page.addInitScript((key) => sessionStorage.setItem(key, "1"), BOOT_SEEN_STORAGE_KEY);
      await page.goto(`${origin}${route.path}`);
      await page.waitForSelector('[data-terminal-ready="true"]', { timeout: 15000 });
      if (route.extraWaitMs) await page.waitForTimeout(route.extraWaitMs);
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});

      const extracted = await extractPage(page);
      let css = await fetchCss(origin, extracted.cssHrefs, cssCache);
      css = await inlineRemoteRefs(css, { origin, cache: assetCache });
      // Retina sibling rewrite MUST run before the generic inliner below —
      // it turns the one absolute reference this script deliberately does
      // NOT inline into a relative one, so the generic pass never sees it.
      let bodyInner = extracted.bodyInner.split("/assets/retina-v.png").join("assets/retina-v.png");
      bodyInner = await inlineRemoteRefs(bodyInner, { origin, cache: assetCache });

      const html = assemble({ ...extracted, bodyInner }, css);
      const outFile = join(outPath, `${route.name}.dc.html`);
      writeFileSync(outFile, html);
      written.push(outFile);
      console.log(`[generate-design-mirror] wrote ${outFile} (${(html.length / 1024).toFixed(1)} KB)`);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  return written;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyRoute = args.find((a) => a.startsWith("--route="))?.split("=")[1];
  const buildArg = args.find((a) => a.startsWith("--build="))?.split("=")[1] ?? "both";

  mkdirSync(OUT_ROOT, { recursive: true });

  const builds = buildArg === "both" ? ["real", "fixtures"] : [buildArg];
  for (const b of builds) {
    if (!BUILDS[b]) throw new Error(`unknown --build value: ${b}`);
    // Wipe only this build's own output directory, not the whole
    // ds-bundle/ — a `--route=` gate run for one build must not delete an
    // already-generated sibling build's output.
    rmSync(join(OUT_ROOT, BUILDS[b].outDir), { recursive: true, force: true });
    await generateBuild(b, { onlyRoute });
  }
  console.log("[generate-design-mirror] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
