// Pure timing/progress/log math for the E.D.I.T.H boot sequence (source of
// truth `Boot Sequence.dc.html`'s `Component` class,
// `renderVals()`/`pct()`/`progress()`). Kept framework-free and dependency-
// free (no Svelte imports) — same rationale as src/common/engines/vim/vim.ts and
// src/common/lib/paste-buffer.ts — so BootSequence.svelte is a thin renderer over
// this module and tests/unit/boot.test.ts can spot-check the formulas
// (thresholds, easing, jitter) without a browser.
//
// Every formula below is transcribed VERBATIM from the mock's
// `Component.progress()/pct()/renderVals()` (line refs as of the handoff
// copy at /Users/shev/Desktop/waiting-on-form-answers/project/
// "Boot Sequence.dc.html", lines 369-442) — do not "simplify" the easing
// exponent, the jitter divisor, or the threshold constants; they were
// tuned by eye against the reference screenshots.

import type { BootData, BootLogEntry, BootStatusRow } from "../common/lib/data";

/** `Component.progress()` (line 369-371): 0..1 linear elapsed fraction,
 * clamped at 1 once `elapsedMs` reaches (or exceeds, from the hard-stop
 * timeout) `durationMs`. */
export function progress(elapsedMs: number, durationMs: number): number {
  return Math.min(1, elapsedMs / durationMs);
}

/** `Component.pct()` (line 373-378): eased 0..100 integer percentage with a
 * small sine jitter overlaid between 2%..99% progress (the "instrument
 * settling" look) — never allowed to push the displayed number outside
 * 0..100 even with the jitter added. */
export function pct(elapsedMs: number, durationMs: number): number {
  const p = progress(elapsedMs, durationMs);
  const eased = 1 - Math.pow(1 - p, 1.7);
  const jitter = p > 0.02 && p < 0.99 ? 2.4 * Math.sin(elapsedMs / 78) : 0;
  return Math.max(0, Math.min(100, Math.round(eased * 100 + jitter)));
}

/** `Component.renderVals()`'s `label` ternary (line 387-388): READY/LOCK/
 * LINK/SCAN/INIT thresholds at 99/86/60/30. */
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

/** `Component.renderVals()`'s `handshake` (line 419): "OK · …" once progress
 * clears 8%, otherwise a "negotiating" ellipsis that cycles 1-3 dots every
 * 220ms of elapsed time. */
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

/** `Component.renderVals()`'s `rows`/`logRows` (line 396-407, 432): every
 * LOG entry whose threshold has been reached, most-recent-last, sliced to
 * the last 5 (only that many are visible at once — the log panel scrolls
 * its own overflow via `justify-content:flex-end`, not this slice, but the
 * mock only ever keeps 5 in the DOM). */
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

/** `Component.renderVals()`'s `pad` helper (line 409): right-pads/truncates
 * to exactly 16 characters so every e.d.i.t.h status-box row's `│`-aligned
 * right edge lines up regardless of the value's own length. */
export function padStatusValue(value: string): string {
  return (value + "                ").slice(0, 16);
}

/** One e.d.i.t.h status-box row's value (`bCore`/`bSession`/`bWindows`/
 * `bRetina`/`bLock`, line 433-437): the row's `onlineText` once `pctValue`
 * clears its own threshold, otherwise 8 mid-dots — both pad()'d to 16. */
export function statusRowValue(pctValue: number, row: BootStatusRow): string {
  return padStatusValue(pctValue > row.threshold ? row.onlineText : "········");
}

/** `Component.renderVals()`'s `progFill` (line 420-427): the conic-gradient
 * inline style string for the progress ring, built the same way (string
 * concatenation, not a template) as the source so a diff against it stays
 * legible. `deg` is `(pct/100) * 360`; below 8deg the short "bright lead"
 * gradient stop is omitted entirely (mirrors the mock's `deg > 8 ? … : ""`
 * branch) rather than emitting a degenerate 0..8deg segment. */
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

/** `Component.renderVals()`'s `spinner` (line 418): computed by the mock
 * but never referenced anywhere in its own template (dead output) — kept
 * here only for parity/tests, deliberately unused by BootSequence.svelte.
 * See that component's header comment. */
export function spinnerFrame(elapsedMs: number): string {
  const frames = "⣾⣽⣻⢿⡿⣟⣯⣷";
  return frames[Math.floor(elapsedMs / 90) % frames.length];
}

/** `Component.dur()` (line 333-336): validates a config duration, falling
 * back to the mock's own 4600ms default for anything non-finite or too
 * small to be a real boot (guards malformed boot.yaml the same way the
 * mock guards a malformed design-tool prop). */
export function bootDuration(bootMs: number): number {
  return Number.isFinite(bootMs) && bootMs > 400 ? bootMs : 4600;
}
