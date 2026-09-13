// Unit tests for the pure boot-sequence math (lib/boot.ts), independent of
// BootSequence.svelte or any browser.
import { expect, test } from "vitest";
import {
  bootDuration,
  handshakeText,
  logRows,
  padStatusValue,
  pct,
  phaseLabel,
  progFillStyle,
  progress,
  spinnerFrame,
  statusRowValue,
} from "../../lib/boot";
import type { BootData, BootLogEntry, BootStatusRow } from "../../../../common/lib/data";

const PHASE_LABELS: BootData["phaseLabels"] = {
  init: "INIT",
  scan: "SCAN",
  link: "LINK",
  lock: "LOCK",
  ready: "READY",
};

const HANDSHAKE: BootData["handshake"] = {
  label: "e.d.i.t.h core handshake ....... ",
  ready: "OK · 0.94 / 0.91",
  negotiating: "negotiating",
};

// ---------------------------------------------------------------------------
// progress / pct
// ---------------------------------------------------------------------------

test("progress: linear 0..1, clamped at the duration", () => {
  expect(progress(0, 4600)).toBe(0);
  expect(progress(2300, 4600)).toBe(0.5);
  expect(progress(4600, 4600)).toBe(1);
  expect(progress(9999, 4600)).toBe(1); // hard-stop overshoot never exceeds 1
});

test("pct: matches the mock's eased+jittered formula at hand-computed points", () => {
  // p=0: eased=0, jitter gated off (p must be >0.02) -> pct=0.
  expect(pct(0, 4600)).toBe(0);

  // p=1 (elapsed==duration): eased=1, jitter gated off (p must be <0.99) -> pct=100.
  expect(pct(4600, 4600)).toBe(100);

  // p=0.5, elapsed=2300: eased = 1 - (1-0.5)^1.7 = 1 - 0.5^1.7.
  // jitter = 2.4*sin(2300/78), hand-computed against Math.pow/Math.sin
  // directly to check the formula is wired together exactly.
  const p = 0.5;
  const eased = 1 - Math.pow(1 - p, 1.7);
  const jitter = 2.4 * Math.sin(2300 / 78);
  const expected = Math.max(0, Math.min(100, Math.round(eased * 100 + jitter)));
  expect(pct(2300, 4600)).toBe(expected);
});

test("pct: never leaves 0..100 even with jitter added", () => {
  for (let e = 0; e <= 4700; e += 37) {
    const v = pct(e, 4600);
    expect(v >= 0 && v <= 100, `pct(${e}) = ${v} out of range`).toBeTruthy();
  }
});

// ---------------------------------------------------------------------------
// phaseLabel — thresholds 30/60/86/99
// ---------------------------------------------------------------------------

test("phaseLabel: INIT/SCAN/LINK/LOCK/READY at the exact boundary values", () => {
  expect(phaseLabel(0, PHASE_LABELS)).toBe("INIT");
  expect(phaseLabel(29, PHASE_LABELS)).toBe("INIT");
  expect(phaseLabel(30, PHASE_LABELS)).toBe("SCAN");
  expect(phaseLabel(59, PHASE_LABELS)).toBe("SCAN");
  expect(phaseLabel(60, PHASE_LABELS)).toBe("LINK");
  expect(phaseLabel(85, PHASE_LABELS)).toBe("LINK");
  expect(phaseLabel(86, PHASE_LABELS)).toBe("LOCK");
  expect(phaseLabel(98, PHASE_LABELS)).toBe("LOCK");
  expect(phaseLabel(99, PHASE_LABELS)).toBe("READY");
  expect(phaseLabel(100, PHASE_LABELS)).toBe("READY");
});

// ---------------------------------------------------------------------------
// handshakeText — 0.08 progress threshold, dot-cycle while negotiating
// ---------------------------------------------------------------------------

test("handshakeText: negotiating below 8% progress, OK above it", () => {
  expect(handshakeText(0.08, 0, HANDSHAKE)).toBe("negotiating.");
  expect(handshakeText(0.081, 0, HANDSHAKE)).toBe("OK · 0.94 / 0.91");
});

test("handshakeText: dot count cycles 1/2/3 every 220ms of elapsed time", () => {
  expect(handshakeText(0, 0, HANDSHAKE)).toBe("negotiating.");
  expect(handshakeText(0, 220, HANDSHAKE)).toBe("negotiating..");
  expect(handshakeText(0, 440, HANDSHAKE)).toBe("negotiating...");
  expect(handshakeText(0, 660, HANDSHAKE)).toBe("negotiating."); // wraps back to 1
});

// ---------------------------------------------------------------------------
// logRows — threshold gating, most-recent-last, capped to 5
// ---------------------------------------------------------------------------

const LOG: BootLogEntry[] = [
  { threshold: 0.02, tag: "ok", label: "mounting shell", val: "Shell.astro" },
  { threshold: 0.1, tag: "ok", label: "hydrating island", val: "Terminal.svelte" },
  { threshold: 0.18, tag: "ok", label: "tmux session", val: "6 windows" },
  { threshold: 0.27, tag: "ok", label: "grep index", val: "22 files" },
  { threshold: 0.36, tag: "ok", label: "repo trees", val: "3 submodules" },
  { threshold: 0.45, tag: "ok", label: "commit snapshots", val: "15 x 3" },
  { threshold: 0.82, tag: "warn", label: "retina-v anomaly", val: "FLERKEN [!]" },
  { threshold: 0.96, tag: "done", label: "e.d.i.t.h online", val: "welcome back, shev" },
];

test("logRows: nothing before the first threshold", () => {
  expect(logRows(0, LOG)).toEqual([]);
});

test("logRows: reveals rows in order as progress crosses thresholds, capped to 5", () => {
  const rows = logRows(0.5, LOG);
  expect(rows.length).toBe(5);
  expect(rows[rows.length - 1].label).toBe("commit snapshots");
  expect(rows[0].label).toBe("hydrating island");
});

test("logRows: warn/done tags carry the mock's exact glyph + color", () => {
  const rows = logRows(1, LOG);
  const warnRow = rows.find((r) => r.label === "retina-v anomaly")!;
  expect(warnRow.tag).toBe("[!!]");
  expect(warnRow.tagColor).toBe("#ff6b6f");
  expect(warnRow.valColor).toBe("#ff6b6f");

  const doneRow = rows.find((r) => r.label === "e.d.i.t.h online")!;
  expect(doneRow.tag).toBe("[>>]");
  expect(doneRow.tagColor).toBe("#d9b04a");
  expect(doneRow.valColor).toBe("#d9b04a");

  const okRow = rows.find((r) => r.label === "grep index")!;
  expect(okRow.tag).toBe("[ok]");
  expect(okRow.tagColor).toBe("#5fc6b4");
  expect(okRow.valColor).toBe("rgba(244,236,233,.9)");
  expect(okRow.val).toBe("22 files"); // flavor text kept verbatim
});

// ---------------------------------------------------------------------------
// padStatusValue / statusRowValue — 16-char padding, per-row thresholds
// ---------------------------------------------------------------------------

test("padStatusValue: right-pads/truncates to exactly 16 characters", () => {
  expect(padStatusValue("ONLINE")).toBe("ONLINE          ");
  expect(padStatusValue("ONLINE").length).toBe(16);
  expect(padStatusValue("········").length).toBe(16);
  expect(padStatusValue("0123456789ABCDEFGH").length).toBe(16); // truncated
});

test("statusRowValue: dots below threshold, onlineText (padded) above it", () => {
  const row: BootStatusRow = { prefix: "│ core ............ ", threshold: 14, onlineText: "ONLINE" };
  expect(statusRowValue(14, row)).toBe(padStatusValue("········"));
  expect(statusRowValue(15, row)).toBe(padStatusValue("ONLINE"));
});

// ---------------------------------------------------------------------------
// progFillStyle — conic-gradient degree math, the deg>8 branch
// ---------------------------------------------------------------------------

test("progFillStyle: omits the bright-lead stop below 8deg (pct < ~2.2%)", () => {
  const style = progFillStyle(0);
  expect(!style.includes("rgba(255,150,140,.95)")).toBeTruthy();
  expect(style.includes("#ffb3a6 0deg")).toBeTruthy();
});

test("progFillStyle: includes the bright-lead stop once deg exceeds 8", () => {
  const style = progFillStyle(50); // deg = 180
  expect(style.includes("rgba(255,150,140,.95) 172deg")).toBeTruthy();
  expect(style.includes("#ffb3a6 180deg")).toBeTruthy();
});

test("progFillStyle: full circle at pct=100 (deg=360)", () => {
  const style = progFillStyle(100);
  expect(style.includes("#ffb3a6 360deg")).toBeTruthy();
  expect(style.includes("360deg 360deg")).toBeTruthy();
});

// ---------------------------------------------------------------------------
// spinnerFrame — unused by BootSequence.svelte
// ---------------------------------------------------------------------------

test("spinnerFrame: cycles the 8 braille glyphs every 90ms", () => {
  const frames = "⣾⣽⣻⢿⡿⣟⣯⣷";
  expect(spinnerFrame(0)).toBe(frames[0]);
  expect(spinnerFrame(90)).toBe(frames[1]);
  expect(spinnerFrame(90 * 8)).toBe(frames[0]); // wraps
});

// ---------------------------------------------------------------------------
// bootDuration — malformed-config guard
// ---------------------------------------------------------------------------

test("bootDuration: passes through a valid value, falls back to 4600 otherwise", () => {
  expect(bootDuration(4600)).toBe(4600);
  expect(bootDuration(1800)).toBe(1800);
  expect(bootDuration(0)).toBe(4600);
  expect(bootDuration(-100)).toBe(4600);
  expect(bootDuration(NaN)).toBe(4600);
});
