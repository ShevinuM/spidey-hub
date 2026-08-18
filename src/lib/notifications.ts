// Pure toast-notification picker (PLAN.md Iteration 3 Phase 2 item 2.3 /
// Locked decision #12): deliberately has NO yaml import (unlike src/lib/
// data.ts's `?raw` loaders) so it stays importable from `node --test`
// (which cannot resolve Vite's `?raw` suffix) and from Playwright specs
// that need to compute the expected picked pair themselves. src/lib/data.ts
// owns loading src/data/notifications.yaml at build time; this module owns
// only the seeded selection logic.

/** sessionStorage key a test fixture can set to pin the toast pick, read at
 * pick time (mount), same pattern as src/lib/bootState.ts's
 * BOOT_SEEN_STORAGE_KEY export. */
export const TOAST_SEED_STORAGE_KEY = "edith:toast-seed";

/** Parse a raw sessionStorage string into a valid uint32 seed, or null if
 * it's missing/unparseable. Pure (no storage access) so it's unit-testable
 * without a DOM/sessionStorage shim. */
export function parseToastSeed(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n >>> 0;
}

/** Seed = Date.now() in prod, overridable via sessionStorage (Locked #12).
 * Guarded for SSR/privacy-mode the same way bootState.ts guards its own
 * sessionStorage access — falls back to Date.now() on any failure. */
export function resolveToastSeed(): number {
  try {
    if (typeof sessionStorage !== "undefined") {
      const parsed = parseToastSeed(sessionStorage.getItem(TOAST_SEED_STORAGE_KEY));
      if (parsed !== null) return parsed;
    }
  } catch {
    // ignore — same best-effort contract as bootState.ts
  }
  return Date.now() >>> 0;
}

/** mulberry32: small, fast, deterministic PRNG (public-domain algorithm by
 * Tommy Ettinger) — good enough for picking 2 toast indices, not for
 * anything cryptographic. Returns a function producing floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick 2 DISTINCT entries from `pool` deterministically from `seed`.
 * Distinctness is guaranteed by construction (the second draw is remapped
 * to skip the first index), not by rejection-sampling — same seed always
 * yields the same ordered pair, and the pair always differs by
 * construction whenever pool.length >= 2. */
export function pickToastPair<T>(pool: readonly T[], seed: number): [T, T] {
  if (pool.length < 2) {
    throw new Error("pickToastPair: pool must have at least 2 entries");
  }
  const rand = mulberry32(seed);
  const firstIndex = Math.floor(rand() * pool.length);
  let secondIndex = Math.floor(rand() * (pool.length - 1));
  if (secondIndex >= firstIndex) secondIndex += 1;
  return [pool[firstIndex], pool[secondIndex]];
}
