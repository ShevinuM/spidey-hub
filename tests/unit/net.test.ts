// Unit tests for src/lib/net.ts's live meter (SIGNAL row)
// — locks in the README's math verbatim (q/lag/hue/bar-height formulas,
// the Resource Timing throughput sum, the netStats fallback chain, and the
// readout format) independent of any DOM/rAF plumbing, which
// tests/e2e/profile.spec.ts covers separately against a live page.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barBackground,
  barBoxShadow,
  barHeight,
  computeThroughputMbps,
  formatReadout,
  hueForHeight,
  lagFromRtt,
  netStats,
  qFromDown,
  smoothRtt,
} from "../../src/lib/net.ts";

test("computeThroughputMbps: sums transferSize>2000 && duration>1 entries, floors at 0.2 Mb/s, null when none qualify", () => {
  assert.equal(computeThroughputMbps([]), null);
  assert.equal(computeThroughputMbps([{ transferSize: 100, duration: 50 }]), null); // below 2000 bytes
  assert.equal(computeThroughputMbps([{ transferSize: 5000, duration: 0.5 }]), null); // below 1ms

  // 1,000,000 bytes over 1000ms = 8 Mb/s.
  const mbps = computeThroughputMbps([{ transferSize: 1_000_000, duration: 1000 }]);
  assert.ok(mbps !== null);
  assert.ok(Math.abs((mbps as number) - 8) < 1e-9);

  // Tiny transfer still floors at 0.2 Mb/s rather than reporting near-zero.
  const floored = computeThroughputMbps([{ transferSize: 2001, duration: 100000 }]);
  assert.equal(floored, 0.2);
});

test("netStats: prefers navigator.connection's own downlink/rtt; falls back to measured/smoothed/defaults", () => {
  assert.deepEqual(netStats({ downlink: 12, rtt: 40, effectiveType: "4g" }, null, null), {
    down: 12,
    rtt: 40,
    type: "4G",
  });

  // No connection API: falls back to measured throughput / smoothed rtt.
  const fallback = netStats(undefined, 30, 80);
  assert.equal(fallback.down, 30);
  assert.equal(fallback.rtt, 80);
  assert.equal(fallback.type, "FAST"); // down > 20

  // Nothing measured yet either: hardcoded defaults (5 Mb/s / 60ms / "LINK").
  assert.deepEqual(netStats(undefined, null, null), { down: 5, rtt: 60, type: "LINK" });

  // rtt of 0 is falsy-ish in the reference (`c.rtt > 0`) — falls through to
  // the smoothed/default value, not 0.
  assert.equal(netStats({ rtt: 0 }, null, null).rtt, 60);
});

test("formatReadout: bare \"offline\" when offline, else \"X.X Mb/s · NNN ms · TYPE\"", () => {
  assert.equal(formatReadout({ down: 1.3, rtt: 745, type: "LINK" }, false), "offline");
  assert.equal(formatReadout({ down: 1.3, rtt: 745, type: "LINK" }, true), "1.3 Mb/s · 745 ms · LINK");
});

test("smoothRtt: 0.6/0.4 blend, rounded; first sample passes through as-is", () => {
  assert.equal(smoothRtt(null, 123.4), 123);
  assert.equal(smoothRtt(100, 200), Math.round(100 * 0.6 + 200 * 0.4));
});

test("qFromDown / lagFromRtt: README mapping, clamped to [0,1]", () => {
  assert.equal(qFromDown(0), 0);
  assert.ok(Math.abs(qFromDown(50) - 1) < 0.01); // log10(51)/log10(51) ≈ 1
  assert.equal(qFromDown(1e9), 1); // clamped

  assert.equal(lagFromRtt(30), 0);
  assert.equal(lagFromRtt(30 - 1000), 0); // clamped low
  assert.equal(lagFromRtt(30 + 500), 1);
  assert.equal(lagFromRtt(30 + 5000), 1); // clamped high
});

test("hueForHeight: 212 at h=0 (blue), 0 at h=1 (red)", () => {
  assert.equal(hueForHeight(0), 212);
  assert.ok(Math.abs(hueForHeight(1) - 0) < 1e-9);
});

test("barHeight: deterministic with an injected rand, clamped to [0.07, cap]", () => {
  const h = barHeight({ index: 0, barCount: 60, tSeconds: 0, env: 0, cap: 1, burst: 0, rand: () => 0.5 });
  // env=0, burst=0, rand()-0.5=0 => raw value is 0, clamped up to the 0.07 floor.
  assert.equal(h, 0.07);

  const capped = barHeight({ index: 0, barCount: 60, tSeconds: 0, env: 10, cap: 0.3, burst: 0, rand: () => 0.5 });
  assert.equal(capped, 0.3);
});

test("barBackground / barBoxShadow: segmented-LED gradient string + glow threshold at h>0.7", () => {
  assert.equal(
    barBackground(212),
    "repeating-linear-gradient(to top, hsl(212 92% 55%) 0 3px, rgba(9,13,18,.85) 3px 4px)",
  );
  assert.equal(barBoxShadow(0.71, 100), "0 0 6px hsl(100 92% 55% / .5)");
  assert.equal(barBoxShadow(0.7, 100), "none");
});
