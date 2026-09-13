// Per-tab "has the boot sequence played this session" flag: boot plays on
// first document load per browser tab; reloads/deep-links within the
// session skip it. sessionStorage (not localStorage) gives a fresh flag per
// tab while surviving a reload of the same tab.
//
// Guarded for SSR (no `sessionStorage` global in Astro's Node render) and
// for browsers that throw on storage access — both degrade to "boot plays"
// (an extra boot is cosmetic; a wrongly-skipped one is a silent missing
// feature) rather than throwing into BootSequence.svelte's render.
const BOOT_SEEN_KEY = "edith:boot-seen";

export function hasBootPlayed(): boolean {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(BOOT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Marked once a genuine (non-skipped) boot STARTS, not once it finishes,
 * so repeatedly reloading mid-boot can't loop the full sequence forever. */
export function markBootPlayed(): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(BOOT_SEEN_KEY, "1");
  } catch {
    // ignore — worst case the sequence replays on the next load
  }
}

/** Exported so both src/common/tests/ui/support/fixtures.ts (Playwright
 * `addInitScript`) and pipeline.mjs (capture pipeline) can pre-seed the
 * exact key a real boot completion would set. */
export const BOOT_SEEN_STORAGE_KEY = BOOT_SEEN_KEY;
