// Uses local-time getters, never UTC, since the visual-regression pipeline freezes the clock at a specific local wall-clock instant (recipes.ts's CLOCK_TIME).
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

// A single frozen epoch, resolved once per page load/reboot rather than calling Date.now() repeatedly, so tmux's createdAt, `tmux ls`, and neofetch's uptime all agree.

/** sessionStorage key a test fixture can set to pin the page epoch, as a decimal ms-since-epoch string. */
export const CLOCK_EPOCH_STORAGE_KEY = "edith:clock-epoch";

/** Parses a raw sessionStorage string into a valid epoch-ms number, or null if missing/unparseable. */
export function parseClockEpoch(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Epoch = Date.now() in prod, overridable via sessionStorage; falls back to Date.now() on any storage failure. */
export function resolvePageEpoch(): number {
  try {
    if (typeof sessionStorage !== "undefined") {
      const parsed = parseClockEpoch(sessionStorage.getItem(CLOCK_EPOCH_STORAGE_KEY));
      if (parsed !== null) return parsed;
    }
  } catch {
    // ignore — best-effort only
  }
  return Date.now();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** asctime-style "{Weekday} {Mon} {DD} {HH:MM:SS} {YYYY}" local time, e.g. "Mon Aug 17 23:34:00 2026" — real tmux's default `created` format for `tmux ls`. */
export function formatCtime(d: Date): string {
  const wd = WEEKDAYS[d.getDay()];
  const month = MONTHS[d.getMonth()];
  const day = pad2(d.getDate());
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${wd} ${month} ${day} ${time} ${d.getFullYear()}`;
}
