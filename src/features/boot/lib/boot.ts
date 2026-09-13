// Pure timing/progress/log math for the boot sequence; framework-free so
// BootSequence.svelte is a thin renderer over this module and the formulas
// (thresholds, easing, jitter) can be unit-tested without a browser. Do not
// "simplify" the easing exponent, the jitter divisor, or the threshold
// constants — they were tuned by eye against the reference screenshots.

import type { BootData, BootLogEntry, BootStatusRow } from "../../../common/lib/data";

/** 0..1 linear elapsed fraction, clamped at 1 once `elapsedMs` reaches (or
 * exceeds, from the hard-stop timeout) `durationMs`. */
export function progress(elapsedMs: number, durationMs: number): number {
  return Math.min(1, elapsedMs / durationMs);
}

/** Eased 0..100 integer percentage with a small sine jitter overlaid
 * between 2%..99% progress — never allowed to push the displayed number
 * outside 0..100 even with the jitter added. */
export function pct(elapsedMs: number, durationMs: number): number {
  const p = progress(elapsedMs, durationMs);
  const eased = 1 - Math.pow(1 - p, 1.7);
  const jitter = p > 0.02 && p < 0.99 ? 2.4 * Math.sin(elapsedMs / 78) : 0;
  return Math.max(0, Math.min(100, Math.round(eased * 100 + jitter)));
}

export function phaseLabel(
  pctValue: number,
  labels: BootData["phaseLabels"],
): string {
  if (pctValue >= 99) return labels.ready;
  if (pctValue >= 86) return labels.lock;
  if (pctValue >= 60) return labels.link;
  if (pctValue >= 30) return labels.scan;
  return labels.init;
}

export function handshakeText(
  progressValue: number,
  elapsedMs: number,
  handshake: BootData["handshake"],
): string {
  if (progressValue > 0.08) return handshake.ready;
  const dots = 1 + (Math.floor(elapsedMs / 220) % 3);
  return handshake.negotiating + ".".repeat(dots);
}

const LOG_TAG_COLOR: Record<BootLogEntry["tag"], string> = {
  ok: "#5fc6b4",
  warn: "#ff6b6f",
  done: "#d9b04a",
};

const LOG_TAG_GLYPH: Record<BootLogEntry["tag"], string> = {
  ok: "[ok]",
  warn: "[!!]",
  done: "[>>]",
};

export interface BootLogRow {
  tag: string;
  tagColor: string;
  label: string;
  val: string;
  valColor: string;
}

/** Every log entry whose threshold has been reached, most-recent-last,
 * sliced to the last 5 — the panel scrolls its own overflow via
 * `justify-content:flex-end`, so this slice only bounds the DOM. */
export function logRows(progressValue: number, log: BootLogEntry[]): BootLogRow[] {
  const rows = log
    .filter((entry) => progressValue >= entry.threshold)
    .map((entry) => ({
      tag: LOG_TAG_GLYPH[entry.tag],
      tagColor: LOG_TAG_COLOR[entry.tag],
      label: entry.label,
      val: entry.val,
      valColor: entry.tag === "warn" ? "#ff6b6f" : entry.tag === "done" ? "#d9b04a" : "rgba(244,236,233,.9)",
    }));
  return rows.slice(-5);
}

/** Right-pads/truncates to exactly 16 characters so every status-box row's
 * `│`-aligned right edge lines up regardless of the value's own length. */
export function padStatusValue(value: string): string {
  return (value + "                ").slice(0, 16);
}

/** A status-box row's value: the row's `onlineText` once `pctValue` clears
 * its own threshold, otherwise 8 mid-dots — both padded to 16. */
export function statusRowValue(pctValue: number, row: BootStatusRow): string {
  return padStatusValue(pctValue > row.threshold ? row.onlineText : "········");
}

/** The conic-gradient inline style for the progress ring. `deg` is
 * `(pct/100) * 360`; below 8deg the short "bright lead" gradient stop is
 * omitted entirely rather than emitting a degenerate 0..8deg segment. */
export function progFillStyle(pctValue: number): string {
  const deg = (pctValue / 100) * 360;
  return (
    "position:absolute;inset:0;margin:auto;width:68%;height:68%;border-radius:50%;background:conic-gradient(from -90deg,rgba(224,69,60,.95) 0deg," +
    (deg > 8 ? "rgba(255,150,140,.95) " + (deg - 8) + "deg," : "") +
    "#ffb3a6 " +
    deg +
    "deg,rgba(224,69,60,0) " +
    deg +
    "deg 360deg);mask:radial-gradient(circle,transparent 0 calc(50% - 4px),#000 calc(50% - 4px) 50%,transparent 50%);-webkit-mask:radial-gradient(circle,transparent 0 calc(50% - 4px),#000 calc(50% - 4px) 50%,transparent 50%);box-shadow:0 0 18px rgba(224,69,60,.18)"
  );
}

/** Deliberately unused by BootSequence.svelte; kept for test coverage. */
export function spinnerFrame(elapsedMs: number): string {
  const frames = "⣾⣽⣻⢿⡿⣟⣯⣷";
  return frames[Math.floor(elapsedMs / 90) % frames.length];
}

/** Validates a config duration, falling back to a 4600ms default for
 * anything non-finite or too small to be a real boot. */
export function bootDuration(bootMs: number): number {
  return Number.isFinite(bootMs) && bootMs > 400 ? bootMs : 4600;
}
