// Unit tests for src/features/notifications/lib/notification-store.ts — pure state-transition logic
// only (no DOM/localStorage/sessionStorage shim needed for most of these;
// the load/save wrappers are exercised separately with a minimal
// localStorage stub).
import { expect, test } from "vitest";
import {
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
  oldestArchivedEntry,
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
} from "../../lib/notification-store";

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
  expect(parseStoredState(null)).toBe(null);
  expect(parseStoredState(undefined)).toBe(null);
  expect(parseStoredState("")).toBe(null);
});

test("parseStoredState: invalid JSON returns null (corrupted storage)", () => {
  expect(parseStoredState("{not json")).toBe(null);
});

test("parseStoredState: wrong shape (no items array) returns null", () => {
  expect(parseStoredState(JSON.stringify({}))).toBe(null);
  expect(parseStoredState(JSON.stringify({ items: "nope" }))).toBe(null);
});

test("parseStoredState: an item missing a required field returns null", () => {
  const bad = {
    items: [
      { id: "x", sev: "alert", title: "t", body: "b", src: "s", read: false, folder: "inbox" },
    ],
  };
  expect(parseStoredState(JSON.stringify(bad))).toBe(null);
});

test("parseStoredState: an item with an invalid sev/folder enum returns null", () => {
  const badSev = { items: [item({ sev: "danger" as never })] };
  expect(parseStoredState(JSON.stringify(badSev))).toBe(null);
  const badFolder = { items: [item({ folder: "trash" as never })] };
  expect(parseStoredState(JSON.stringify(badFolder))).toBe(null);
});

test("parseStoredState: a well-formed state round-trips", () => {
  const state: NotificationState = { items: [item({})] };
  const parsed = parseStoredState(JSON.stringify(state));
  expect(parsed).toEqual(state);
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
    expect(loadState()).toEqual({ items: [] });
  });
});

test("loadState: corrupted value falls back to an empty state (never throws)", () => {
  withLocalStorage({ [NOTIFICATIONS_STORAGE_KEY]: "{{{not json" }, () => {
    expect(loadState()).toEqual({ items: [] });
  });
});

test("saveState then loadState round-trips", () => {
  withLocalStorage({}, () => {
    const state: NotificationState = { items: [item({ id: "roundtrip" })] };
    saveState(state);
    expect(loadState()).toEqual(state);
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
  expect(a).toEqual(b);
});

test("pickRandomUnseen: never returns an id already in seenIds", () => {
  const seen = new Set(POOL.slice(0, 10).map((p) => p.id));
  const picks = pickRandomUnseen(POOL, seen, 5, Math.random);
  for (const p of picks) expect(!seen.has(p.id)).toBeTruthy();
});

test("pickRandomUnseen: caps at the number of unseen entries remaining", () => {
  const seen = new Set(POOL.slice(0, 11).map((p) => p.id));
  const picks = pickRandomUnseen(POOL, seen, 2, Math.random);
  expect(picks.length).toBe(1);
});

test("pickRandomUnseen: pool exhausted returns an empty array", () => {
  const seen = new Set(POOL.map((p) => p.id));
  const picks = pickRandomUnseen(POOL, seen, 2, Math.random);
  expect(picks).toEqual([]);
});

test("injectVisit: injects exactly 2 new unread inbox items timestamped `now`", () => {
  const { state, injected } = injectVisit({ items: [] }, POOL, 5000, mulberry32(1));
  expect(injected.length).toBe(2);
  expect(state.items.length).toBe(2);
  for (const i of state.items) {
    expect(i.read).toBe(false);
    expect(i.folder).toBe("inbox");
    expect(i.ts).toBe(5000);
  }
});

test("injectVisit: never re-injects an id already present in state", () => {
  const seenIds = new Set(POOL.slice(0, 10).map((p) => p.id));
  const existing: NotificationItem[] = [...seenIds].map((id) => item({ id }));
  const { injected } = injectVisit({ items: existing }, POOL, 9999, Math.random);
  for (const i of injected) expect(!seenIds.has(i.id)).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Pool-exhaustion re-circulation
// ---------------------------------------------------------------------------
// Once every pool entry has been seen, injectVisit revives the oldest
// archived (non-spam) entry to the inbox instead of picking from the pool.

test("oldestArchivedEntry: returns null when nothing is archived", () => {
  const items = POOL.map((p) => item({ id: p.id, folder: "inbox" }));
  expect(oldestArchivedEntry(items)).toBe(null);
});

test("oldestArchivedEntry: ignores spam-folder items entirely", () => {
  const items = POOL.map((p) => item({ id: p.id, folder: "spam", ts: 1 }));
  expect(oldestArchivedEntry(items)).toBe(null);
});

test("oldestArchivedEntry: picks the lowest ts among archived items", () => {
  const items = [
    item({ id: "a", folder: "archive", ts: 300 }),
    item({ id: "b", folder: "archive", ts: 100 }),
    item({ id: "c", folder: "archive", ts: 200 }),
    item({ id: "d", folder: "spam", ts: 50 }),
  ];
  expect(oldestArchivedEntry(items)?.id).toBe("b");
});

test("injectVisit: exhausted pool re-injects exactly one oldest archived non-spam entry", () => {
  const existing: NotificationItem[] = POOL.map((p, i) =>
    item({ id: p.id, folder: i < 3 ? "archive" : "inbox", ts: i < 3 ? 100 + i : 9000 }),
  );
  const before: NotificationState = { items: existing };
  const { state, injected } = injectVisit(before, POOL, 5000, Math.random);
  expect(injected.length).toBe(1);
  expect(injected[0].id).toBe("pool-0"); // ts 100, the lowest among the 3 archived
  expect(state.items.length).toBe(existing.length);
});

test("injectVisit: re-injected item is unread, in the inbox folder, restamped `now`, and returned in injected[]", () => {
  const existing: NotificationItem[] = POOL.map((p, i) =>
    item({ id: p.id, folder: i === 0 ? "archive" : "inbox", ts: 1, read: true }),
  );
  const { state, injected } = injectVisit({ items: existing }, POOL, 7777, Math.random);
  expect(injected.length).toBe(1);
  const revived = injected[0];
  expect(revived.read).toBe(false);
  expect(revived.folder).toBe("inbox");
  expect(revived.ts).toBe(7777);
  const inState = state.items.find((i) => i.id === revived.id);
  expect(inState).toEqual(revived);
});

test("injectVisit: exhausted pool with only spam archived injects none and leaves state unchanged", () => {
  const existing: NotificationItem[] = POOL.map((p, i) =>
    item({ id: p.id, folder: i === 0 ? "spam" : "inbox" }),
  );
  const before: NotificationState = { items: existing };
  const { state, injected } = injectVisit(before, POOL, 1, Math.random);
  expect(injected).toEqual([]);
  expect(state).toBe(before);
});

test("injectVisit: repeat visits re-circulate oldest-first, deterministically, until the archive drains", () => {
  const existing: NotificationItem[] = POOL.map((p, i) =>
    item({ id: p.id, folder: i < 3 ? "archive" : "inbox", ts: i < 3 ? 100 + i * 10 : 9000 }),
  );
  let state: NotificationState = { items: existing };

  const first = injectVisit(state, POOL, 1000, Math.random);
  expect(first.injected[0].id).toBe("pool-0"); // ts 100
  state = first.state;

  const second = injectVisit(state, POOL, 2000, Math.random);
  expect(second.injected[0].id).toBe("pool-1"); // ts 110
  state = second.state;

  const third = injectVisit(state, POOL, 3000, Math.random);
  expect(third.injected[0].id).toBe("pool-2"); // ts 120
  state = third.state;

  // Archive is now empty (all three revived to inbox) — a fourth visit
  // injects nothing.
  const fourth = injectVisit(state, POOL, 4000, Math.random);
  expect(fourth.injected).toEqual([]);
  expect(fourth.state).toBe(state);
});

test("injectVisit: re-circulated state round-trips through save/load", () => {
  withLocalStorage({}, () => {
    const existing: NotificationItem[] = POOL.map((p, i) =>
      item({ id: p.id, folder: i === 0 ? "archive" : "inbox", ts: 1 }),
    );
    const { state } = injectVisit({ items: existing }, POOL, 4242, Math.random);
    saveState(state);
    expect(loadState()).toEqual(state);
  });
});

test("injectVisit: pool with exactly 1 unseen entry injects only that 1", () => {
  const allButOne = POOL.slice(1).map((p) => p.id);
  const existing: NotificationItem[] = allButOne.map((id) => item({ id }));
  const { injected } = injectVisit({ items: existing }, POOL, 1, Math.random);
  expect(injected.length).toBe(1);
  expect(injected[0].id).toBe(POOL[0].id);
});

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

test("toggleRead: flips only the matching item's read flag", () => {
  const state: NotificationState = {
    items: [item({ id: "a", read: false }), item({ id: "b", read: true })],
  };
  const next = toggleRead(state, "a");
  expect(next.items.find((i) => i.id === "a")!.read).toBe(true);
  expect(next.items.find((i) => i.id === "b")!.read).toBe(true);
});

test("dismiss: an inbox item moves to archive and becomes read", () => {
  const state: NotificationState = { items: [item({ id: "a", folder: "inbox", read: false })] };
  const next = dismiss(state, "a");
  expect(next.items.length).toBe(1);
  expect(next.items[0].folder).toBe("archive");
  expect(next.items[0].read).toBe(true);
});

test("dismiss: an archived item is deleted outright", () => {
  const state: NotificationState = { items: [item({ id: "a", folder: "archive" })] };
  const next = dismiss(state, "a");
  expect(next.items.length).toBe(0);
});

test("dismiss: a spam item is deleted outright", () => {
  const state: NotificationState = { items: [item({ id: "a", folder: "spam" })] };
  const next = dismiss(state, "a");
  expect(next.items.length).toBe(0);
});

test("markSpam: moves an item to the spam folder without touching read state", () => {
  const state: NotificationState = { items: [item({ id: "a", folder: "inbox", read: false })] };
  const next = markSpam(state, "a");
  expect(next.items[0].folder).toBe("spam");
  expect(next.items[0].read).toBe(false);
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
  expect(next.items.find((i) => i.id === "a")!.read).toBe(true);
  expect(next.items.find((i) => i.id === "b")!.read).toBe(true);
  expect(next.items.find((i) => i.id === "c")!.read).toBe(false);
  expect(next.items.find((i) => i.id === "d")!.read).toBe(false);
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
  expect(folderItems(state, "inbox").length).toBe(3);
  expect(folderItems(state, "archive").length).toBe(1);
  expect(folderItems(state, "spam").length).toBe(1);
  // alerts tab: inbox-folder AND sev alert only — archived alert (d) excluded.
  expect(alertItems(state).map((i) => i.id)).toEqual(["a", "c"]);
  expect(unreadInboxCount(state)).toBe(2);
});

// ---------------------------------------------------------------------------
// Toast timing helpers
// ---------------------------------------------------------------------------

test("toastDurationMs: severity-scaled durations", () => {
  expect(toastDurationMs("alert")).toBe(10000);
  expect(toastDurationMs("warn")).toBe(5000);
  expect(toastDurationMs("info")).toBe(3000);
  expect(toastDurationMs("alert", 0.1)).toBe(1000);
});

test("remainingOnHold: floors at the minimum remainder", () => {
  expect(remainingOnHold(1000, 999)).toBe(400);
  expect(remainingOnHold(2000, 1000)).toBe(1000);
});

test("parseToastDurationScale: rejects non-positive/unparseable values", () => {
  expect(parseToastDurationScale(null)).toBe(null);
  expect(parseToastDurationScale("")).toBe(null);
  expect(parseToastDurationScale("not-a-number")).toBe(null);
  expect(parseToastDurationScale("0")).toBe(null);
  expect(parseToastDurationScale("-1")).toBe(null);
  expect(parseToastDurationScale("0.02")).toBe(0.02);
});

test("parseInjectSeed: coerces to a uint32, rejects unparseable input", () => {
  expect(parseInjectSeed(null)).toBe(null);
  expect(parseInjectSeed("not-a-number")).toBe(null);
  expect(parseInjectSeed("424242")).toBe(424242);
});

// ---------------------------------------------------------------------------
// Fixture state (determinism)
// ---------------------------------------------------------------------------

test("buildFixtureState: fixed item count/folders, never touches localStorage", () => {
  const state = buildFixtureState(2_000_000);
  expect(state.items.length).toBe(5);
  expect(folderItems(state, "inbox").length).toBe(3);
  expect(folderItems(state, "archive").length).toBe(1);
  expect(folderItems(state, "spam").length).toBe(1);
  expect(unreadInboxCount(state)).toBe(2);
});

test("buildFixtureState: deterministic for the same `now`", () => {
  expect(buildFixtureState(123456)).toEqual(buildFixtureState(123456));
});
