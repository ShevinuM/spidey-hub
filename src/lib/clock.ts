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
