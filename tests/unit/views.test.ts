// Locks grepPathToView() (src/lib/views.ts) against the real grep index
// (public/generated/grep-index.json, refreshed by `pnpm generate`) — the
// no-false-positive property flagged by Phase 8's verifier and fixed in
// Phase 9: real-index rules must be segment-anchored so a future real file
// can never be mis-routed by an incidental substring match (e.g. a bare
// `/info/i` catching a hypothetical `src/lib/info.ts`). This test mirrors
// what the verifier checked by hand — every path in the *current* real
// index maps to exactly the view an explicit, hand-audited whitelist says
// it should, and nothing else.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { grepPathToView } from "../../src/lib/views.ts";

const ROOT = join(import.meta.dirname, "../..");
const realIndex = JSON.parse(readFileSync(join(ROOT, "public/generated/grep-index.json"), "utf8")) as {
  path: string;
}[];

/**
 * Hand-audited whitelist of every real-index path that should route
 * somewhere, as of this writing (see PLAN.md Phase 9). Anything in the real
 * index NOT matched by one of these patterns must map to `null` — that's
 * the actual "no false positive" property: every one of the ~70 other real
 * paths (data/*.yaml, lib/*.ts, pages/*.astro, tests/**, root configs) is
 * asserted null below, not merely spot-checked.
 */
function expectedView(path: string): "personnel" | "builds" | "retina-v" | "profile" | null {
  if (/^src\/content\/personnel\//.test(path)) return "personnel";
  if (/^src\/content\/projects\//.test(path)) return "builds";
  if (path === "src/components/Personnel.svelte") return "personnel";
  if (path === "src/components/Builds.svelte") return "builds";
  if (path === "src/components/Wallpaper.svelte") return "retina-v";
  if (path === "src/components/Profile.svelte") return "profile";
  return null;
}

test("every path in the real grep index routes exactly as hand-audited (no false positives)", () => {
  assert.ok(realIndex.length > 0, "real grep index must be non-empty (run `pnpm generate` first)");

  const mismatches: string[] = [];
  for (const { path } of realIndex) {
    const expected = expectedView(path);
    const actual = grepPathToView(path);
    if (actual !== expected) {
      mismatches.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test("routed paths are exactly the personnel content dir, the projects content dir, and the 4 named components", () => {
  const routed = realIndex.filter(({ path }) => grepPathToView(path) !== null).map((f) => f.path);
  const expectedRouted = realIndex.filter(({ path }) => expectedView(path) !== null).map((f) => f.path);
  assert.deepEqual([...routed].sort(), [...expectedRouted].sort());
  // Sanity: this isn't a vacuous "always null" pass — there ARE routed paths.
  assert.ok(routed.length >= 8, `expected at least 8 routed real paths, got ${routed.length}`);
});

test("a hypothetical future real path containing the legacy bare words does NOT mis-route", () => {
  // These are exactly the kind of path the old unanchored regex
  // (`/info/i`, `/xp|Yazi/i`, `/projects|Lazygit/i`, `/Tracker|Radar|
  // subjects/i`) would have wrongly routed had a real file like this ever
  // been added — none of them exist in the real index today, but the
  // tightened rules must reject them regardless of the index's contents.
  assert.equal(grepPathToView("src/lib/info.ts"), null);
  assert.equal(grepPathToView("src/lib/xp-utils.ts"), null);
  assert.equal(grepPathToView("src/data/projects-notes.md"), null);
  assert.equal(grepPathToView("tests/e2e/radar.spec.ts"), null);
  assert.equal(grepPathToView("src/components/RadarBlip.svelte"), null);
});

test("3-segment personnel content paths (company/employmentType/file, PLAN.md Phase 2 item 7 restructure) route to personnel", () => {
  // grepPathToView's real-index rule is a depth-agnostic prefix match
  // (`(^|\/)content\/personnel\/`), so the Phase 2 restructure to
  // src/content/personnel/<company>/<employmentType>/<file>.md needs no
  // code change here — this test locks that in explicitly rather than
  // relying solely on the generated-index comparison above.
  assert.equal(grepPathToView("src/content/personnel/Enaimco/Full-Time/software-developer.md"), "personnel");
  assert.equal(grepPathToView("src/content/personnel/Enaimco/Part-Time/software-developer.md"), "personnel");
  assert.equal(grepPathToView("src/content/personnel/Enaimco/Co-op/software-developer.md"), "personnel");
});

test("fixture-only legacy paths (all under src/) never route via the bare-word fallback", () => {
  // fixtures/grep-index.json's own paths, gated out because they live
  // under src/ — the real rules above own that prefix unconditionally, so
  // these fall through to null rather than the prototype's original
  // bare-word regex (which has zero test coverage anyway — the visual
  // recipes never press Enter in the grep overlay).
  for (const p of [
    "src/pages/xp.astro",
    "src/pages/projects.astro",
    "src/components/Tracker.svelte",
    "src/components/Radar.svelte",
    "src/content/xp/ontario-tech.md",
  ]) {
    assert.equal(grepPathToView(p), null, p);
  }
});
