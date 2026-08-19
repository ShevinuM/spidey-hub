// Unit tests for src/lib/notificationStore.ts — pure state-transition logic
// only (no DOM/localStorage/sessionStorage shim needed for most of these;
// the load/save wrappers are exercised separately with a minimal
// localStorage stub).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agoLabel,
  alertItems,
  buildFixtureState,
  dismiss,
  folderItems,
  injectVisit,
  loadState,
  markAllRead,
  markSpam,
  mulberry32,
  NOTIFICATIONS_STORAGE_KEY,
  parseInjectSeed,
  parseStoredState,
  parseToastDurationScale,
  pickRandomUnseen,
  remainingOnHold,
  saveState,
  toastDurationMs,
  toggleRead,
  unreadInboxCount,
  type NotificationItem,
  type NotificationState,
  type PoolEntry,
} from "../../src/lib/notificationStore.ts";

const POOL: PoolEntry[] = Array.from({ length: 12 }, (_, i) => ({
  id: `pool-${i}`,
  sev: (["alert", "warn", "info"] as const)[i % 3],
  title: `title-${i}`,
  body: `body-${i}`,
  src: `src-${i}`,
}));

function item(overrides: Partial<NotificationItem>): NotificationItem {
  return {
    id: "id-1",
    sev: "info",
    title: "t",
    body: "b",
    src: "s",
    ts: 1000,
    read: false,
    folder: "inbox",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseStoredState / corrupted storage
// ---------------------------------------------------------------------------

test("parseStoredState: null/undefined/empty returns null", () => {
  assert.equal(parseStoredState(null), null);
  assert.equal(parseStoredState(undefined), null);
  assert.equal(parseStoredState(""), null);
});

test("parseStoredState: invalid JSON returns null (corrupted storage)", () => {
  assert.equal(parseStoredState("{not json"), null);
});

test("parseStoredState: wrong shape (no items array) returns null", () => {
  assert.equal(parseStoredState(JSON.stringify({})), null);
  assert.equal(parseStoredState(JSON.stringify({ items: "nope" })), null);
});

test("parseStoredState: an item missing a required field returns null", () => {
  const bad = { items: [{ id: "x", sev: "alert", title: "t", body: "b", src: "s", read: false, folder: "inbox" }] };
  assert.equal(parseStoredState(JSON.stringify(bad)), null);
});

test("parseStoredState: an item with an invalid sev/folder enum returns null", () => {
  const badSev = { items: [item({ sev: "danger" as never })] };
  assert.equal(parseStoredState(JSON.stringify(badSev)), null);
  const badFolder = { items: [item({ folder: "trash" as never })] };
  assert.equal(parseStoredState(JSON.stringify(badFolder)), null);
});

test("parseStoredState: a well-formed state round-trips", () => {
  const state: NotificationState = { items: [item({})] };
  const parsed = parseStoredState(JSON.stringify(state));
  assert.deepEqual(parsed, state);
});

// ---------------------------------------------------------------------------
// loadState / saveState (minimal localStorage stub — corrupted -> reset)
// ---------------------------------------------------------------------------

function withLocalStorage<T>(initial: Record<string, string>, fn: () => T): T {
  const store = new Map(Object.entries(initial));
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as Record<string, unknown>).localStorage = stub;
  try {
    return fn();
  } finally {
    delete (globalThis as Record<string, unknown>).localStorage;
  }
}

test("loadState: missing key falls back to an empty state", () => {
  withLocalStorage({}, () => {
    assert.deepEqual(loadState(), { items: [] });
  });
});

test("loadState: corrupted value falls back to an empty state (never throws)", () => {
  withLocalStorage({ [NOTIFICATIONS_STORAGE_KEY]: "{{{not json" }, () => {
    assert.deepEqual(loadState(), { items: [] });
  });
});

test("saveState then loadState round-trips", () => {
  withLocalStorage({}, () => {
    const state: NotificationState = { items: [item({ id: "roundtrip" })] };
    saveState(state);
    assert.deepEqual(loadState(), state);
  });
});

// ---------------------------------------------------------------------------
// pickRandomUnseen / injectVisit
// ---------------------------------------------------------------------------

test("pickRandomUnseen: deterministic with a seeded rand", () => {
  const rand = mulberry32(42);
  const rand2 = mulberry32(42);
  const a = pickRandomUnseen(POOL, new Set(), 2, rand);
  const b = pickRandomUnseen(POOL, new Set(), 2, rand2);
  assert.deepEqual(a, b);
});

test("pickRandomUnseen: never returns an id already in seenIds", () => {
  const seen = new Set(POOL.slice(0, 10).map((p) => p.id));
  const picks = pickRandomUnseen(POOL, seen, 5, Math.random);
  for (const p of picks) assert.ok(!seen.has(p.id));
});

test("pickRandomUnseen: caps at the number of unseen entries remaining", () => {
  const seen = new Set(POOL.slice(0, 11).map((p) => p.id));
  const picks = pickRandomUnseen(POOL, seen, 2, Math.random);
  assert.equal(picks.length, 1);
});

test("pickRandomUnseen: pool exhausted returns an empty array", () => {
  const seen = new Set(POOL.map((p) => p.id));
  const picks = pickRandomUnseen(POOL, seen, 2, Math.random);
  assert.deepEqual(picks, []);
});

test("injectVisit: injects exactly 2 new unread inbox items timestamped `now`", () => {
  const { state, injected } = injectVisit({ items: [] }, POOL, 5000, mulberry32(1));
  assert.equal(injected.length, 2);
  assert.equal(state.items.length, 2);
  for (const i of state.items) {
    assert.equal(i.read, false);
    assert.equal(i.folder, "inbox");
    assert.equal(i.ts, 5000);
  }
});

test("injectVisit: never re-injects an id already present in state", () => {
  const seenIds = new Set(POOL.slice(0, 10).map((p) => p.id));
  const existing: NotificationItem[] = [...seenIds].map((id) => item({ id }));
  const { injected } = injectVisit({ items: existing }, POOL, 9999, Math.random);
  for (const i of injected) assert.ok(!seenIds.has(i.id));
});

test("injectVisit: pool exhausted injects none and leaves state unchanged", () => {
  const existing: NotificationItem[] = POOL.map((p) => item({ id: p.id }));
  const before: NotificationState = { items: existing };
  const { state, injected } = injectVisit(before, POOL, 1, Math.random);
  assert.deepEqual(injected, []);
  assert.equal(state, before);
});

test("injectVisit: pool with exactly 1 unseen entry injects only that 1", () => {
  const allButOne = POOL.slice(1).map((p) => p.id);
  const existing: NotificationItem[] = allButOne.map((id) => item({ id }));
  const { injected } = injectVisit({ items: existing }, POOL, 1, Math.random);
  assert.equal(injected.length, 1);
  assert.equal(injected[0].id, POOL[0].id);
});

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

test("toggleRead: flips only the matching item's read flag", () => {
  const state: NotificationState = { items: [item({ id: "a", read: false }), item({ id: "b", read: true })] };
  const next = toggleRead(state, "a");
  assert.equal(next.items.find((i) => i.id === "a")!.read, true);
  assert.equal(next.items.find((i) => i.id === "b")!.read, true);
});

test("dismiss: an inbox item moves to archive and becomes read", () => {
  const state: NotificationState = { items: [item({ id: "a", folder: "inbox", read: false })] };
  const next = dismiss(state, "a");
  assert.equal(next.items.length, 1);
  assert.equal(next.items[0].folder, "archive");
  assert.equal(next.items[0].read, true);
});

test("dismiss: an archived item is deleted outright", () => {
  const state: NotificationState = { items: [item({ id: "a", folder: "archive" })] };
  const next = dismiss(state, "a");
  assert.equal(next.items.length, 0);
});

test("dismiss: a spam item is deleted outright", () => {
  const state: NotificationState = { items: [item({ id: "a", folder: "spam" })] };
  const next = dismiss(state, "a");
  assert.equal(next.items.length, 0);
});

test("markSpam: moves an item to the spam folder without touching read state", () => {
  const state: NotificationState = { items: [item({ id: "a", folder: "inbox", read: false })] };
  const next = markSpam(state, "a");
  assert.equal(next.items[0].folder, "spam");
  assert.equal(next.items[0].read, false);
});

test("markAllRead: marks every inbox item read, leaves archive/spam untouched", () => {
  const state: NotificationState = {
    items: [
      item({ id: "a", folder: "inbox", read: false }),
      item({ id: "b", folder: "inbox", read: false }),
      item({ id: "c", folder: "archive", read: false }),
      item({ id: "d", folder: "spam", read: false }),
    ],
  };
  const next = markAllRead(state);
  assert.equal(next.items.find((i) => i.id === "a")!.read, true);
  assert.equal(next.items.find((i) => i.id === "b")!.read, true);
  assert.equal(next.items.find((i) => i.id === "c")!.read, false);
  assert.equal(next.items.find((i) => i.id === "d")!.read, false);
});

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

test("folderItems / alertItems / unreadInboxCount", () => {
  const state: NotificationState = {
    items: [
      item({ id: "a", folder: "inbox", sev: "alert", read: false }),
      item({ id: "b", folder: "inbox", sev: "info", read: false }),
      item({ id: "c", folder: "inbox", sev: "alert", read: true }),
      item({ id: "d", folder: "archive", sev: "alert", read: true }),
      item({ id: "e", folder: "spam", sev: "warn", read: false }),
    ],
  };
  assert.equal(folderItems(state, "inbox").length, 3);
  assert.equal(folderItems(state, "archive").length, 1);
  assert.equal(folderItems(state, "spam").length, 1);
  // alerts tab: inbox-folder AND sev alert only — archived alert (d) excluded.
  assert.deepEqual(
    alertItems(state).map((i) => i.id),
    ["a", "c"],
  );
  assert.equal(unreadInboxCount(state), 2);
});

// ---------------------------------------------------------------------------
// agoLabel
// ---------------------------------------------------------------------------

test("agoLabel: seconds/minutes/hours/days thresholds", () => {
  const now = 1_000_000_000;
  assert.equal(agoLabel(now - 42_000, now), "42s");
  assert.equal(agoLabel(now - 6 * 60_000, now), "6m");
  assert.equal(agoLabel(now - 2 * 3_600_000, now), "2h");
  assert.equal(agoLabel(now - 3 * 86_400_000, now), "3d");
});

test("agoLabel: never negative even if ts is momentarily ahead of now", () => {
  assert.equal(agoLabel(1000, 999), "0s");
});

// ---------------------------------------------------------------------------
// Toast timing helpers
// ---------------------------------------------------------------------------

test("toastDurationMs: severity-scaled durations", () => {
  assert.equal(toastDurationMs("alert"), 10000);
  assert.equal(toastDurationMs("warn"), 5000);
  assert.equal(toastDurationMs("info"), 3000);
  assert.equal(toastDurationMs("alert", 0.1), 1000);
});

test("remainingOnHold: floors at the minimum remainder", () => {
  assert.equal(remainingOnHold(1000, 999), 400);
  assert.equal(remainingOnHold(2000, 1000), 1000);
});

test("parseToastDurationScale: rejects non-positive/unparseable values", () => {
  assert.equal(parseToastDurationScale(null), null);
  assert.equal(parseToastDurationScale(""), null);
  assert.equal(parseToastDurationScale("not-a-number"), null);
  assert.equal(parseToastDurationScale("0"), null);
  assert.equal(parseToastDurationScale("-1"), null);
  assert.equal(parseToastDurationScale("0.02"), 0.02);
});

test("parseInjectSeed: coerces to a uint32, rejects unparseable input", () => {
  assert.equal(parseInjectSeed(null), null);
  assert.equal(parseInjectSeed("not-a-number"), null);
  assert.equal(parseInjectSeed("424242"), 424242);
});

// ---------------------------------------------------------------------------
// Fixture state (determinism)
// ---------------------------------------------------------------------------

test("buildFixtureState: fixed item count/folders, never touches localStorage", () => {
  const state = buildFixtureState(2_000_000);
  assert.equal(state.items.length, 5);
  assert.equal(folderItems(state, "inbox").length, 3);
  assert.equal(folderItems(state, "archive").length, 1);
  assert.equal(folderItems(state, "spam").length, 1);
  assert.equal(unreadInboxCount(state), 2);
});

test("buildFixtureState: deterministic for the same `now`", () => {
  assert.deepEqual(buildFixtureState(123456), buildFixtureState(123456));
});
