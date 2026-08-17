// Unit tests for the pure boot-sequence math (src/lib/boot.ts, PLAN.md
// Phase 5B item 5B.1/5B.5 "boot timings/text spot-checked against the mock
// source line-by-line"). Every assertion below reproduces a value computed
// by hand from the mock's own `Component.pct()/progress()/renderVals()`
// formulas (Boot Sequence.dc.html lines 369-437) — this is the guard
// against a transcription slip in src/lib/boot.ts, independent of
// BootSequence.svelte or any browser.
import { test } from "node:test";
import assert from "node:assert/strict";
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
} from "../../src/lib/boot.ts";
import type { BootData, BootLogEntry, BootStatusRow } from "../../src/lib/data.ts";

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
  assert.equal(progress(0, 4600), 0);
  assert.equal(progress(2300, 4600), 0.5);
  assert.equal(progress(4600, 4600), 1);
  assert.equal(progress(9999, 4600), 1); // hard-stop overshoot never exceeds 1
});

test("pct: matches the mock's eased+jittered formula at hand-computed points", () => {
  // p=0: eased=0, jitter gated off (p must be >0.02) -> pct=0.
  assert.equal(pct(0, 4600), 0);

  // p=1 (elapsed==duration): eased=1, jitter gated off (p must be <0.99) -> pct=100.
  assert.equal(pct(4600, 4600), 100);

  // p=0.5, elapsed=2300: eased = 1 - (1-0.5)^1.7 = 1 - 0.5^1.7.
  // jitter = 2.4*sin(2300/78). Hand-computed against Math.pow/Math.sin
  // directly (not re-deriving the formula, just checking the transcription
  // wires them together exactly as the mock does).
  const p = 0.5;
  const eased = 1 - Math.pow(1 - p, 1.7);
  const jitter = 2.4 * Math.sin(2300 / 78);
  const expected = Math.max(0, Math.min(100, Math.round(eased * 100 + jitter)));
  assert.equal(pct(2300, 4600), expected);
});

test("pct: never leaves 0..100 even with jitter added", () => {
  for (let e = 0; e <= 4700; e += 37) {
    const v = pct(e, 4600);
    assert.ok(v >= 0 && v <= 100, `pct(${e}) = ${v} out of range`);
  }
});

// ---------------------------------------------------------------------------
// phaseLabel — thresholds 30/60/86/99 (PLAN.md 5B.1)
// ---------------------------------------------------------------------------

test("phaseLabel: INIT/SCAN/LINK/LOCK/READY at the exact boundary values", () => {
  assert.equal(phaseLabel(0, PHASE_LABELS), "INIT");
  assert.equal(phaseLabel(29, PHASE_LABELS), "INIT");
  assert.equal(phaseLabel(30, PHASE_LABELS), "SCAN");
  assert.equal(phaseLabel(59, PHASE_LABELS), "SCAN");
  assert.equal(phaseLabel(60, PHASE_LABELS), "LINK");
  assert.equal(phaseLabel(85, PHASE_LABELS), "LINK");
  assert.equal(phaseLabel(86, PHASE_LABELS), "LOCK");
  assert.equal(phaseLabel(98, PHASE_LABELS), "LOCK");
  assert.equal(phaseLabel(99, PHASE_LABELS), "READY");
  assert.equal(phaseLabel(100, PHASE_LABELS), "READY");
});

// ---------------------------------------------------------------------------
// handshakeText — 0.08 progress threshold, dot-cycle while negotiating
// ---------------------------------------------------------------------------

test("handshakeText: negotiating below 8% progress, OK above it", () => {
  assert.equal(handshakeText(0.08, 0, HANDSHAKE), "negotiating.");
  assert.equal(handshakeText(0.081, 0, HANDSHAKE), "OK · 0.94 / 0.91");
});

test("handshakeText: dot count cycles 1/2/3 every 220ms of elapsed time", () => {
  assert.equal(handshakeText(0, 0, HANDSHAKE), "negotiating.");
  assert.equal(handshakeText(0, 220, HANDSHAKE), "negotiating..");
  assert.equal(handshakeText(0, 440, HANDSHAKE), "negotiating...");
  assert.equal(handshakeText(0, 660, HANDSHAKE), "negotiating."); // wraps back to 1
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
  assert.deepEqual(logRows(0, LOG), []);
});

test("logRows: reveals rows in order as progress crosses thresholds, capped to 5", () => {
  const rows = logRows(0.5, LOG);
  // Thresholds 0.02..0.45 have all been reached (6 rows) but only the last
  // 5 are kept, most-recent-last.
  assert.equal(rows.length, 5);
  assert.equal(rows[rows.length - 1].label, "commit snapshots");
  assert.equal(rows[0].label, "hydrating island");
});

test("logRows: warn/done tags carry the mock's exact glyph + color", () => {
  const rows = logRows(1, LOG);
  const warnRow = rows.find((r) => r.label === "retina-v anomaly")!;
  assert.equal(warnRow.tag, "[!!]");
  assert.equal(warnRow.tagColor, "#ff6b6f");
  assert.equal(warnRow.valColor, "#ff6b6f");

  const doneRow = rows.find((r) => r.label === "e.d.i.t.h online")!;
  assert.equal(doneRow.tag, "[>>]");
  assert.equal(doneRow.tagColor, "#d9b04a");
  assert.equal(doneRow.valColor, "#d9b04a");

  const okRow = rows.find((r) => r.label === "grep index")!;
  assert.equal(okRow.tag, "[ok]");
  assert.equal(okRow.tagColor, "#5fc6b4");
  assert.equal(okRow.valColor, "rgba(244,236,233,.9)");
  assert.equal(okRow.val, "22 files"); // flavor text kept verbatim
});

// ---------------------------------------------------------------------------
// padStatusValue / statusRowValue — 16-char padding, per-row thresholds
// ---------------------------------------------------------------------------

test("padStatusValue: right-pads/truncates to exactly 16 characters", () => {
  assert.equal(padStatusValue("ONLINE"), "ONLINE          ");
  assert.equal(padStatusValue("ONLINE").length, 16);
  assert.equal(padStatusValue("········").length, 16);
  assert.equal(padStatusValue("0123456789ABCDEFGH").length, 16); // truncated
});

test("statusRowValue: dots below threshold, onlineText (padded) above it", () => {
  const row: BootStatusRow = { prefix: "│ core ............ ", threshold: 14, onlineText: "ONLINE" };
  assert.equal(statusRowValue(14, row), padStatusValue("········"));
  assert.equal(statusRowValue(15, row), padStatusValue("ONLINE"));
});

// ---------------------------------------------------------------------------
// progFillStyle — conic-gradient degree math, the deg>8 branch
// ---------------------------------------------------------------------------

test("progFillStyle: omits the bright-lead stop below 8deg (pct < ~2.2%)", () => {
  const style = progFillStyle(0);
  assert.ok(!style.includes("rgba(255,150,140,.95)"));
  assert.ok(style.includes("#ffb3a6 0deg"));
});

test("progFillStyle: includes the bright-lead stop once deg exceeds 8", () => {
  const style = progFillStyle(50); // deg = 180
  assert.ok(style.includes("rgba(255,150,140,.95) 172deg"));
  assert.ok(style.includes("#ffb3a6 180deg"));
});

test("progFillStyle: full circle at pct=100 (deg=360)", () => {
  const style = progFillStyle(100);
  assert.ok(style.includes("#ffb3a6 360deg"));
  assert.ok(style.includes("360deg 360deg"));
});

// ---------------------------------------------------------------------------
// spinnerFrame — computed but unused by BootSequence.svelte (mock parity)
// ---------------------------------------------------------------------------

test("spinnerFrame: cycles the 8 braille glyphs every 90ms", () => {
  const frames = "⣾⣽⣻⢿⡿⣟⣯⣷";
  assert.equal(spinnerFrame(0), frames[0]);
  assert.equal(spinnerFrame(90), frames[1]);
  assert.equal(spinnerFrame(90 * 8), frames[0]); // wraps
});

// ---------------------------------------------------------------------------
// bootDuration — malformed-config guard
// ---------------------------------------------------------------------------

test("bootDuration: passes through a valid value, falls back to 4600 otherwise", () => {
  assert.equal(bootDuration(4600), 4600);
  assert.equal(bootDuration(1800), 1800);
  assert.equal(bootDuration(0), 4600);
  assert.equal(bootDuration(-100), 4600);
  assert.equal(bootDuration(NaN), 4600);
});
