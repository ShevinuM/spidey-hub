// Live status-bar clock formatting (PLAN.md bug fix 2: the prototype
// hardcodes "23:34" / "15-Aug-26"; we render the real local time/date in the
// same format and keep it updating). This is formatting logic, not
// copy — the month abbreviations are a fixed calendar table, not narrative
// site content, so it lives in src/lib (outside the src/components|layouts|
// pages audit) same as docline.ts/grep.ts.
//
// IMPORTANT: use local-time getters (getHours/getMinutes/getDate/getMonth/
// getFullYear), never UTC/ISO — the visual-regression capture pipeline
// installs a fake clock at a literal local wall-clock instant
// (2026-08-15T23:34:00, tests/visual/recipes.ts CLOCK_TIME), and a UTC leak
// would render a different hour/date on any non-UTC machine.
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "HH:MM" in 24h local time, e.g. "23:34". */
export function formatClockTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "DD-Mon-YY" local date, e.g. "15-Aug-26". */
export function formatClockDate(d: Date): string {
  const day = pad2(d.getDate());
  const month = MONTHS[d.getMonth()];
  const year = pad2(d.getFullYear() % 100);
  return `${day}-${month}-${year}`;
}

/** Milliseconds until the next minute boundary (for a minute-aligned timer). */
export function msUntilNextMinute(d: Date): number {
  return 60000 - (d.getSeconds() * 1000 + d.getMilliseconds());
}

// ---------------------------------------------------------------------------
// Frozen page clock (PLAN.md Iteration 3 Phase 4 "Determinism rules": "no
// wall-clock timestamps except via the frozen page clock helpers in
// src/lib/clock.ts" — tmux session `createdAt`, `tmux ls`'s "created {ctime}"
// column, and neofetch's uptime line all read this ONE epoch, resolved once
// per page load/reboot, rather than calling `Date.now()` repeatedly at
// render time. Same sessionStorage-override-with-Date.now()-fallback shape
// as src/lib/notifications.ts's TOAST_SEED_STORAGE_KEY/resolveToastSeed()
// and src/lib/bootState.ts's BOOT_SEEN_STORAGE_KEY — a test fixture pins the
// key, production falls through to the real clock.
// ---------------------------------------------------------------------------

/** sessionStorage key a test fixture can set to pin the page epoch (ms since
 * Unix epoch, as a decimal string) — read once at client-factory time (initial
 * mount AND every `reboot`), same pattern as TOAST_SEED_STORAGE_KEY. */
export const CLOCK_EPOCH_STORAGE_KEY = "edith:clock-epoch";

/** Parse a raw sessionStorage string into a valid epoch-ms number, or null if
 * missing/unparseable — pure, no storage access, unit-testable without a
 * DOM/sessionStorage shim (mirrors parseToastSeed's own shape). */
export function parseClockEpoch(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Epoch = Date.now() in prod, overridable via sessionStorage. Guarded for
 * SSR/privacy-mode the same way bootState.ts/notifications.ts guard their
 * own sessionStorage access — falls back to Date.now() on any failure. */
export function resolvePageEpoch(): number {
  try {
    if (typeof sessionStorage !== "undefined") {
      const parsed = parseClockEpoch(sessionStorage.getItem(CLOCK_EPOCH_STORAGE_KEY));
      if (parsed !== null) return parsed;
    }
  } catch {
    // ignore — same best-effort contract as bootState.ts/notifications.ts
  }
  return Date.now();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** asctime-style "{Weekday} {Mon} {DD} {HH:MM:SS} {YYYY}" local time, e.g.
 * "Mon Aug 17 23:34:00 2026" — real tmux's own default `created` format for
 * `tmux ls` (PLAN.md tmux fidelity reference). Always fed a Date built from
 * a frozen epoch (`Session.createdAt`, itself from `resolvePageEpoch()`
 * above) — never `new Date()` at call time. */
export function formatCtime(d: Date): string {
  const wd = WEEKDAYS[d.getDay()];
  const month = MONTHS[d.getMonth()];
  const day = pad2(d.getDate());
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${wd} ${month} ${day} ${time} ${d.getFullYear()}`;
}
