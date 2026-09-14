// Unit tests for boot-state.ts's per-tab "has boot played this session"
// flag.
//
// Pure Vitest, no DOM: sessionStorage is a real Node global (unlike
// localStorage), so each test installs its own explicit stub via
// `globalThis` for determinism rather than relying on ambient Node state.
import { afterEach, expect, test } from "vitest";
import { BOOT_SEEN_STORAGE_KEY, hasBootPlayed, markBootPlayed } from "../../lib/boot-state";

const ORIGINAL_DESCRIPTOR = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");

function restoreSessionStorage() {
  if (ORIGINAL_DESCRIPTOR) {
    Object.defineProperty(globalThis, "sessionStorage", ORIGINAL_DESCRIPTOR);
  } else {
    delete (globalThis as Record<string, unknown>).sessionStorage;
  }
}

afterEach(() => {
  restoreSessionStorage();
});

/** Minimal working `sessionStorage` stub — same shape as
 * notification-store.test.ts's `withLocalStorage` stub. */
function installWorkingSessionStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as Record<string, unknown>).sessionStorage = stub;
  return store;
}

/** Simulates the Astro Node SSR render, where there is no `sessionStorage`
 * global at all. */
function removeSessionStorage() {
  delete (globalThis as Record<string, unknown>).sessionStorage;
}

/** Simulates a browser that throws on storage access (private/incognito
 * mode with storage disabled, or a quota error). */
function installThrowingSessionStorage() {
  const stub = {
    getItem: () => {
      throw new Error("storage access disabled");
    },
    setItem: () => {
      throw new Error("storage access disabled");
    },
    removeItem: () => {
      throw new Error("storage access disabled");
    },
  };
  (globalThis as Record<string, unknown>).sessionStorage = stub;
}

// ---------------------------------------------------------------------------
// SSR / undefined sessionStorage — both must degrade to "boot plays"
// ---------------------------------------------------------------------------

test("hasBootPlayed: no sessionStorage global (SSR) returns false, never throws", () => {
  removeSessionStorage();
  expect(() => hasBootPlayed()).not.toThrow();
  expect(hasBootPlayed()).toBe(false);
});

test("markBootPlayed: no sessionStorage global (SSR) is a no-op, never throws", () => {
  removeSessionStorage();
  expect(() => markBootPlayed()).not.toThrow();
});

// ---------------------------------------------------------------------------
// Storage access throws (private browsing / disabled storage) — both must
// degrade to "boot plays" rather than propagating
// ---------------------------------------------------------------------------

test("hasBootPlayed: a throwing sessionStorage.getItem returns false, never throws", () => {
  installThrowingSessionStorage();
  expect(() => hasBootPlayed()).not.toThrow();
  expect(hasBootPlayed()).toBe(false);
});

test("markBootPlayed: a throwing sessionStorage.setItem is swallowed, never throws", () => {
  installThrowingSessionStorage();
  expect(() => markBootPlayed()).not.toThrow();
});

// ---------------------------------------------------------------------------
// Round trip, and the mark-on-start (not mark-on-finish) invariant
// ---------------------------------------------------------------------------

test("hasBootPlayed: false before markBootPlayed, true after (round trip)", () => {
  installWorkingSessionStorage();
  expect(hasBootPlayed()).toBe(false);
  markBootPlayed();
  expect(hasBootPlayed()).toBe(true);
});

test("markBootPlayed: writes the exact key BootSequence.svelte pre-seeds/reads elsewhere", () => {
  const store = installWorkingSessionStorage();
  markBootPlayed();
  expect(store.get(BOOT_SEEN_STORAGE_KEY)).toBe("1");
});

test("hasBootPlayed: any other stored value (not exactly \"1\") reads as not-played", () => {
  const store = installWorkingSessionStorage();
  store.set(BOOT_SEEN_STORAGE_KEY, "true");
  expect(hasBootPlayed()).toBe(false);
});
