// Locks grepPathToView() (src/common/lib/views.ts) against the real grep index
// (public/generated/grep-index.json, refreshed by `pnpm generate`) — the
// no-false-positive property requires real-index rules to be
// segment-anchored so a future real file
// can never be mis-routed by an incidental substring match (e.g. a bare
// `/info/i` catching a hypothetical `src/lib/info.ts`). This test mirrors
// what the verifier checked by hand — every path in the *current* real
// index maps to exactly the view an explicit, hand-audited whitelist says
// it should, and nothing else.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { grepPathToView, viewToTmuxBinding } from "../../src/common/lib/views";

const ROOT = join(import.meta.dirname, "../..");
const realIndex = JSON.parse(readFileSync(join(ROOT, "public/generated/grep-index.json"), "utf8")) as {
  path: string;
}[];

/**
 * Hand-audited whitelist of every real-index path that should route
 * somewhere, as of this writing. Anything in the real
 * index NOT matched by one of these patterns must map to `null` — that's
 * the actual "no false positive" property: every one of the ~70 other real
 * paths (data/*.yaml, lib/*.ts, pages/*.astro, tests/**, root configs) is
 * asserted null below, not merely spot-checked.
 */
function expectedView(path: string): "employment" | "repositories" | "retina-v" | "profile" | null {
  if (path.startsWith("src/content/personnel/")) return "employment";
  if (path.startsWith("src/content/repositories/")) return "repositories";
  if (path === "src/components/employment-records/EmploymentRecords.svelte") return "employment";
  if (path === "src/components/repositories/Repositories.svelte") return "repositories";
  if (path === "src/components/Wallpaper.svelte") return "retina-v";
  if (path === "src/components/Profile.svelte") return "profile";
  return null;
}

test("every path in the real grep index routes exactly as hand-audited (no false positives)", () => {
  expect(realIndex.length > 0, "real grep index must be non-empty (run `pnpm generate` first)").toBeTruthy();

  const mismatches: string[] = [];
  for (const { path } of realIndex) {
    const expected = expectedView(path);
    const actual = grepPathToView(path);
    if (actual !== expected) {
      mismatches.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }
  expect(mismatches).toEqual([]);
});

test("routed paths are exactly the personnel content dir, the repositories content dir, and the 4 named components", () => {
  const routed = realIndex.filter(({ path }) => grepPathToView(path) !== null).map((f) => f.path);
  const expectedRouted = realIndex.filter(({ path }) => expectedView(path) !== null).map((f) => f.path);
  expect([...routed].sort()).toEqual([...expectedRouted].sort());
  // Sanity: this isn't a vacuous "always null" pass — there ARE routed paths.
  expect(routed.length >= 8, `expected at least 8 routed real paths, got ${routed.length}`).toBeTruthy();
});

test("a hypothetical future real path containing the legacy bare words does NOT mis-route", () => {
  // These are exactly the kind of path the old unanchored regex
  // (`/info/i`, `/xp|Yazi/i`, `/projects|Lazygit/i`, `/Tracker|Radar|
  // subjects/i`) would have wrongly routed had a real file like this ever
  // been added — none of them exist in the real index today, but the
  // tightened rules must reject them regardless of the index's contents.
  expect(grepPathToView("src/lib/info.ts")).toBe(null);
  expect(grepPathToView("src/lib/xp-utils.ts")).toBe(null);
  expect(grepPathToView("src/data/projects-notes.md")).toBe(null);
  expect(grepPathToView("tests/e2e/radar.spec.ts")).toBe(null);
  expect(grepPathToView("src/components/RadarBlip.svelte")).toBe(null);
});

test("variable-depth personnel content paths (path-derived tree) route to employment", () => {
  // grepPathToView's real-index rule is a depth-agnostic prefix match
  // (`(^|\/)content\/personnel\/`), so the
  // variable-depth tree (2-5 path segments — enaimco/software-developer/
  // role.md vs. enaimco/software-developer/full-time/role.md vs.
  // memorial-university/<slug>/role.md) needs no code change here — this
  // test locks that in explicitly rather than relying solely on the
  // generated-index comparison above.
  expect(grepPathToView("src/content/personnel/enaimco/software-developer/role.md")).toBe("employment");
  expect(grepPathToView("src/content/personnel/enaimco/software-developer/full-time/role.md")).toBe("employment");
  expect(grepPathToView("src/content/personnel/memorial-university/computer-science-tutor/role.md")).toBe("employment");
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
    expect(grepPathToView(p), p).toBe(null);
  }
});

test("viewToTmuxBinding looks up the live window number, never a fixed table", () => {
  const windowNumbers = { dashboard: 0, repositories: 1, employment: 2, "retina-v": 3, profile: 4, help: 5 };
  expect(viewToTmuxBinding("repositories", windowNumbers)).toBe("C-b 1");
  expect(viewToTmuxBinding("help", windowNumbers)).toBe("C-b 5");

  // A window's number moving (e.g. after a kill/re-create elsewhere)
  // changes the binding — nothing here is hardcoded by menu position.
  const reshuffled = { ...windowNumbers, help: 9 };
  expect(viewToTmuxBinding("help", reshuffled)).toBe("C-b 9");

  // A view whose window isn't present in the live session has no binding.
  const { help: _help, ...withoutHelp } = windowNumbers;
  expect(viewToTmuxBinding("help", withoutHelp)).toBe(undefined);
});
