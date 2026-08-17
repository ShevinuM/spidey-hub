// Per-tab "has the boot sequence played this session" flag (PLAN.md Phase
// 5B item 5B.3: "boot plays on first document load per browser tab
// (sessionStorage flag); reloads/deep-links within the session skip it").
// sessionStorage (not localStorage) is exactly "per browser tab" — a new
// tab (even to the same origin) gets a fresh sessionStorage, matching the
// spec precisely; a reload of the same tab keeps it.
//
// Guarded for SSR (no `sessionStorage` global in Astro's Node render) and
// for browsers that throw on storage access (privacy mode / disabled
// storage) — both must degrade to "boot plays" (the safer default: an
// extra boot is a cosmetic replay, a wrongly-skipped one would be a silent
// missing feature) rather than throwing into BootSequence.svelte's render.
const BOOT_SEEN_KEY = "edith:boot-seen";

export function hasBootPlayed(): boolean {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(BOOT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Marked once a genuine (non-skipped) boot STARTS — not once it finishes —
 * so repeatedly reloading mid-boot can't loop the full sequence forever;
 * see BootSequence.svelte's header comment for the reasoning. */
export function markBootPlayed(): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(BOOT_SEEN_KEY, "1");
  } catch {
    // ignore — worst case the sequence replays on the next load
  }
}

/** Exported so both tests/e2e/fixtures.ts (Playwright `addInitScript`) and
 * tests/visual/pipeline.mjs (capture pipeline) can pre-seed the exact same
 * key a real boot completion would set, instead of a second hardcoded
 * string drifting out of sync with this module. */
export const BOOT_SEEN_STORAGE_KEY = BOOT_SEEN_KEY;
