// Pure notification-state logic (no Svelte runes, no DOM/localStorage
// access except inside the explicitly-guarded load/save wrappers) — same
// split src/features/notifications/lib/toast-seed.ts established for the old toast picker:
// this file is importable from `node --test` (which cannot compile runes)
// and from Playwright specs that need to compute expected state themselves.
// Notifications.svelte owns the ONLY `$state` wrapping these functions —
// every mutation re-assigns through one of the pure transitions below.

export type NotificationSeverity = "alert" | "warn" | "info";
export type NotificationFolder = "inbox" | "archive" | "spam";

/** A pool entry (built from the `notifications` content collection,
 * src/features/notifications/content/*.md) — content only, no per-instance state
 * yet (that's added at injection time). */
export interface PoolEntry {
  id: string;
  sev: NotificationSeverity;
  title: string;
  body: string;
  src: string;
}

/** A live notification: a pool entry plus the instance state a user's
 * actions/visit history produce. */
export interface NotificationItem extends PoolEntry {
  ts: number;
  read: boolean;
  folder: NotificationFolder;
}

export interface NotificationState {
  items: NotificationItem[];
}

export const NOTIFICATIONS_STORAGE_KEY = "spideyhub.notifications.v1";
export const NOTIFICATIONS_INJECT_PER_VISIT = 2;

/** Toast auto-dismiss durations (Mockup B) — severity-timed, not a single
 * flat delay. */
export const TOAST_DURATION_MS: Record<NotificationSeverity, number> = {
  alert: 10000,
  warn: 5000,
  info: 3000,
};

export const TOAST_STACK_CAP = 4;

/** Hovering a toast pauses its dismiss timer; releasing restarts it with
 * whatever time was left, floored at this minimum so a toast hovered right
 * before its natural expiry doesn't vanish the instant the pointer leaves. */
export const TOAST_HOVER_MIN_REMAINDER_MS = 400;

/** sessionStorage override for e2e: a multiplier applied to every toast's
 * duration (e.g. 0.02 turns a 10s alert into 200ms) so specs never sleep
 * through the real severity timers. Read once at toast-spawn time, same
 * best-effort contract as src/features/notifications/lib/toast-seed.ts's old toast-seed key. */
export const TOAST_DURATION_SCALE_STORAGE_KEY = "edith:notifications-toast-scale";

/** sessionStorage override for e2e: a numeric seed pinning WHICH unseen pool
 * entries get injected on this visit, so a spec can assert on exact content
 * instead of "some 2 items appeared". Absent in production — real visits
 * pick randomly via `Math.random`, never deterministically. */
export const NOTIFICATIONS_INJECT_SEED_STORAGE_KEY = "edith:notifications-inject-seed";

export const SEVERITY_META: Record<NotificationSeverity, { color: string; glow: string; glyph: string; label: string }> = {
  alert: { color: "#ff5c66", glow: "rgba(255,92,102,.22)", glyph: "▲", label: "ALERT" },
  warn: { color: "#e8b04b", glow: "rgba(232,176,75,.20)", glyph: "■", label: "WARN" },
  info: { color: "#4fd1c5", glow: "rgba(79,209,197,.18)", glyph: "●", label: "INFO" },
};

// ---------------------------------------------------------------------------
// Storage parse/load/save
// ---------------------------------------------------------------------------

function isSeverity(v: unknown): v is NotificationSeverity {
  return v === "alert" || v === "warn" || v === "info";
}

function isFolder(v: unknown): v is NotificationFolder {
  return v === "inbox" || v === "archive" || v === "spam";
}

function isNotificationItem(v: unknown): v is NotificationItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    isSeverity(o.sev) &&
    typeof o.title === "string" &&
    typeof o.body === "string" &&
    typeof o.src === "string" &&
    typeof o.ts === "number" &&
    Number.isFinite(o.ts) &&
    typeof o.read === "boolean" &&
    isFolder(o.folder)
  );
}

/** Parse a raw localStorage string into a valid state, or `null` if it's
 * missing/unparseable/shape-invalid — pure (no storage access), so
 * unit-testable without a DOM/localStorage shim, same convention as
 * src/features/notifications/lib/toast-seed.ts's `parseToastSeed`. A `null` return is the
 * caller's cue to fall back to an empty state (corrupted storage resets
 * gracefully rather than throwing). */
export function parseStoredState(raw: string | null | undefined): NotificationState | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as Record<string, unknown>).items)) return null;
  const items = (parsed as { items: unknown[] }).items;
  if (!items.every(isNotificationItem)) return null;
  return { items: items as NotificationItem[] };
}

export function serializeState(state: NotificationState): string {
  return JSON.stringify(state);
}

const EMPTY_STATE: NotificationState = { items: [] };

/** Best-effort localStorage read — same guarded try/catch contract as
 * src/features/boot/lib/boot-state.ts (private-browsing/storage-disabled environments
 * throw on access, not just on write). Corrupted or missing storage falls
 * back to an empty state rather than throwing. */
export function loadState(): NotificationState {
  try {
    if (typeof localStorage === "undefined") return EMPTY_STATE;
    return parseStoredState(localStorage.getItem(NOTIFICATIONS_STORAGE_KEY)) ?? EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: NotificationState): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, serializeState(state));
  } catch {
    // best-effort — same contract as loadState()/boot-state.ts
  }
}

// ---------------------------------------------------------------------------
// mulberry32 (public-domain PRNG, same algorithm src/features/notifications/lib/toast-seed.ts
// used for the old toast pick) — deterministic when seeded, good enough for
// picking pool entries, not cryptographic.
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Injection: each visit injects up to 2 unseen pool entries, chosen
// randomly by id. Once every pool entry has been seen (Decision 6), a visit
// instead re-circulates the single oldest archived (never spam-folder)
// entry back to the inbox as a fresh unread item — only once the archive is
// ALSO empty (or holds spam only) does a visit inject nothing.
// ---------------------------------------------------------------------------

/** Picks up to `count` entries from `pool` whose `id` isn't in `seenIds`,
 * each pick removed from the running candidate list so the result never
 * repeats an id — order is randomized via `rand` (defaults to
 * `Math.random`, override with a seeded `mulberry32` for determinism).
 * Returns fewer than `count` (down to zero) once the pool is exhausted —
 * never throws. */
export function pickRandomUnseen(
  pool: readonly PoolEntry[],
  seenIds: ReadonlySet<string>,
  count: number,
  rand: () => number = Math.random,
): PoolEntry[] {
  const remaining = pool.filter((p) => !seenIds.has(p.id));
  const picked: PoolEntry[] = [];
  const n = Math.min(count, remaining.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rand() * remaining.length);
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picked;
}

/** Returns the oldest (lowest `ts`) archived item in `items`, or `null` if
 * the archive is empty — spam-folder items are never candidates, so a
 * spam-only archive also returns `null`. Ties broken by array order (the
 * first item at the minimum `ts` wins), so the result is deterministic for
 * a given input. Used by `injectVisit`'s pool-exhaustion re-circulation
 * (Decision 6). */
export function oldestArchivedEntry(items: readonly NotificationItem[]): NotificationItem | null {
  let oldest: NotificationItem | null = null;
  for (const i of items) {
    if (i.folder !== "archive") continue;
    if (oldest === null || i.ts < oldest.ts) oldest = i;
  }
  return oldest;
}

/** Injects up to `count` unseen pool entries into `state` as new, unread
 * inbox items timestamped `now`, returning both the next state and the
 * items just injected (so the caller can spawn toasts for exactly those —
 * never for anything already in `state`).
 *
 * Once every pool entry has already been seen, this instead re-circulates
 * (Decision 6) the single oldest archived entry: it's moved back to the
 * inbox, marked unread, restamped `now`, and returned in `injected` exactly
 * like a fresh pool pick — so the caller spawns a toast for it too. Spam-
 * folder entries are never eligible, so a spam-only (or empty) archive
 * falls through to the final no-op case: `state` unchanged, `injected: []`. */
export function injectVisit(
  state: NotificationState,
  pool: readonly PoolEntry[],
  now: number,
  rand: () => number = Math.random,
  count: number = NOTIFICATIONS_INJECT_PER_VISIT,
): { state: NotificationState; injected: NotificationItem[] } {
  const seen = new Set(state.items.map((i) => i.id));
  const picks = pickRandomUnseen(pool, seen, count, rand);
  if (picks.length > 0) {
    const injected: NotificationItem[] = picks.map((p) => ({ ...p, ts: now, read: false, folder: "inbox" }));
    return { state: { items: [...injected, ...state.items] }, injected };
  }
  const stale = oldestArchivedEntry(state.items);
  if (!stale) return { state, injected: [] };
  const revived: NotificationItem = { ...stale, ts: now, read: false, folder: "inbox" };
  const rest = state.items.filter((i) => i !== stale);
  return { state: { items: [revived, ...rest] }, injected: [revived] };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export function toggleRead(state: NotificationState, id: string): NotificationState {
  return { items: state.items.map((i) => (i.id === id ? { ...i, read: !i.read } : i)) };
}

/** inbox -> archive (and marked read); anywhere else -> deleted outright. */
export function dismiss(state: NotificationState, id: string): NotificationState {
  return {
    items: state.items.flatMap((i) => {
      if (i.id !== id) return [i];
      if (i.folder === "inbox") return [{ ...i, folder: "archive", read: true }];
      return [];
    }),
  };
}

/** A third per-row action beyond the mockup's two: moves an item to the
 * web·trap tab from any folder. Read state is untouched — spam is a
 * relocation, not a read/unread transition. */
export function markSpam(state: NotificationState, id: string): NotificationState {
  return { items: state.items.map((i) => (i.id === id ? { ...i, folder: "spam" } : i)) };
}

/** Scoped to the inbox folder only — archive/spam items are unaffected. */
export function markAllRead(state: NotificationState): NotificationState {
  return { items: state.items.map((i) => (i.folder === "inbox" ? { ...i, read: true } : i)) };
}

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

export function folderItems(state: NotificationState, folder: NotificationFolder): NotificationItem[] {
  return state.items.filter((i) => i.folder === folder);
}

/** The "alerts" tab is a derived filter of inbox alerts, never a distinct
 * stored folder. */
export function alertItems(state: NotificationState): NotificationItem[] {
  return state.items.filter((i) => i.folder === "inbox" && i.sev === "alert");
}

/** Unread badge count — inbox folder only. */
export function unreadInboxCount(state: NotificationState): number {
  return state.items.filter((i) => i.folder === "inbox" && !i.read).length;
}

// ---------------------------------------------------------------------------
// Relative-time formatting
// ---------------------------------------------------------------------------

/** "42s"/"6m"/"1h"/"3d" — floors at 0 (never a negative age even if `ts` is
 * momentarily ahead of `now`, e.g. a fresh injection read back the same
 * tick). */
export function agoLabel(ts: number, now: number): string {
  const diffMs = Math.max(0, now - ts);
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// ---------------------------------------------------------------------------
// Toast timing helpers
// ---------------------------------------------------------------------------

export function toastDurationMs(sev: NotificationSeverity, scale: number = 1): number {
  return Math.max(50, Math.round(TOAST_DURATION_MS[sev] * scale));
}

/** How much time is left on a toast's dismiss timer when it's hovered at
 * `now`, given the timer's original `endAt` — floored at
 * TOAST_HOVER_MIN_REMAINDER_MS, so a toast hovered right before its
 * natural expiry doesn't vanish the instant the pointer leaves. */
export function remainingOnHold(endAt: number, now: number): number {
  return Math.max(TOAST_HOVER_MIN_REMAINDER_MS, endAt - now);
}

/** Parses the sessionStorage duration-scale override, or `null` if
 * missing/unparseable/non-positive. */
export function parseToastDurationScale(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function resolveToastDurationScale(): number {
  try {
    if (typeof sessionStorage !== "undefined") {
      const parsed = parseToastDurationScale(sessionStorage.getItem(TOAST_DURATION_SCALE_STORAGE_KEY));
      if (parsed !== null) return parsed;
    }
  } catch {
    // ignore — best-effort, same contract as loadState()
  }
  return 1;
}

/** Parses the sessionStorage injection-seed override, or `null` if
 * missing/unparseable. */
export function parseInjectSeed(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n >>> 0;
}

export function resolveInjectRand(): () => number {
  try {
    if (typeof sessionStorage !== "undefined") {
      const parsed = parseInjectSeed(sessionStorage.getItem(NOTIFICATIONS_INJECT_SEED_STORAGE_KEY));
      if (parsed !== null) return mulberry32(parsed);
    }
  } catch {
    // ignore — best-effort, same contract as loadState()
  }
  return Math.random;
}

// ---------------------------------------------------------------------------
// Determinism fixture: a fixed, hand-authored state for golden capture — never touches localStorage, never injects, never spawns toasts.
// `now` is the caller's current Date.now() (frozen by Playwright's faked
// clock during a golden capture), so `ago` labels resolve deterministically
// without hardcoding an absolute timestamp here.
// ---------------------------------------------------------------------------

export function buildFixtureState(now: number): NotificationState {
  const MIN = 60_000;
  const HOUR = 3_600_000;
  return {
    items: [
      {
        id: "fixture-alert-unread",
        sev: "alert",
        title: "Symbiote signature @ pane 4",
        body: "Retina-V flagged an unregistered mask in the Brooklyn feed.",
        src: "edith/retina-v",
        ts: now - 42_000,
        read: false,
        folder: "inbox",
      },
      {
        id: "fixture-warn-unread",
        sev: "warn",
        title: "Build #2291 drifted",
        body: "Web-shooter firmware pipeline finished with 3 warnings.",
        src: "ci/web-shooter",
        ts: now - 6 * MIN,
        read: false,
        folder: "inbox",
      },
      {
        id: "fixture-info-read",
        sev: "info",
        title: "Session resynced",
        body: "10.42.7.13 reattached cleanly after a brief drop.",
        src: "tmux/daemon",
        ts: now - 23 * MIN,
        read: true,
        folder: "inbox",
      },
      {
        id: "fixture-warn-archived",
        sev: "warn",
        title: "Rooftop sensor offline",
        body: "Queens grid node 12 stopped reporting.",
        src: "grid/queens",
        ts: now - HOUR,
        read: true,
        folder: "archive",
      },
      {
        id: "fixture-info-spam",
        sev: "info",
        title: "\"You have won 6 web-fluid cartridges\"",
        body: "Sender spoofed oscorp-labs.co · quarantined on arrival.",
        src: "mail/unknown",
        ts: now - 3 * HOUR,
        read: false,
        folder: "spam",
      },
    ],
  };
}
