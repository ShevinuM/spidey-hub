// Live network meter math (Profile view SIGNAL row) — ported verbatim from
// the reference `Component` methods `linkSpeed`/`netStats`/`probe`/
// `startMeter` (design/Homepage.dc.html lines ~918-978) and the handoff
// README's "Live meter (SIGNAL row)" section. Kept as pure, DOM-free
// functions here so the math is independently testable; Meter.svelte owns
// the one requestAnimationFrame loop that writes the results directly onto
// the bar DOM nodes (README: "do NOT re-render 60 nodes per frame through
// the framework").
//
// One deliberate deviation from the prototype's own JS, following the
// README (behavior truth for this phase) over the sample markup: the
// prototype's `probe()` builds the offline readout as
// `"offline" + " · " + rtt + " ms · " + type` (line 939's ternary only
// swaps the leading "X.X Mb/s" segment). The README instead specifies a
// bare `"offline"` readout, and the e2e regex the plan hands us
// (`/^(measuring…|offline|...)$/`) is anchored and only accepts the bare
// form — so `formatReadout` below returns plain `"offline"`, not the
// prototype's concatenated string.

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export interface ResourceTimingEntry {
  transferSize: number;
  duration: number;
}

/** Throughput (Mb/s) estimated from Resource Timing entries, mirroring the
 * reference `linkSpeed()`: sums transferSize/duration over entries with
 * `transferSize > 2000 && duration > 1`, in bytes/ms -> Mb/s, floored at
 * 0.2. Returns null when no qualifying entries have loaded yet (matching
 * the prototype's `ms ? ... : null`). */
export function computeThroughputMbps(entries: readonly ResourceTimingEntry[]): number | null {
  let bytes = 0;
  let ms = 0;
  for (const e of entries) {
    if (e.transferSize > 2000 && e.duration > 1) {
      bytes += e.transferSize;
      ms += e.duration;
    }
  }
  return ms ? Math.max(0.2, (bytes * 8) / 1e6 / (ms / 1000)) : null;
}

export interface NetConnectionLike {
  downlink?: number;
  rtt?: number;
  effectiveType?: string;
}

export interface NetSample {
  down: number;
  rtt: number;
  type: string;
}

/** Ports the reference `netStats()`: prefers `navigator.connection`'s own
 * downlink/rtt when present, else falls back to the measured throughput /
 * smoothed probe RTT (or the same hardcoded defaults — 5 Mb/s, 60ms — the
 * prototype uses before any measurement exists). */
export function netStats(
  connection: NetConnectionLike | undefined,
  measuredMbps: number | null,
  smoothedRttMs: number | null,
): NetSample {
  const c = connection ?? {};
  const down = typeof c.downlink === "number" ? c.downlink : (measuredMbps ?? 5);
  const rtt = typeof c.rtt === "number" && c.rtt > 0 ? c.rtt : (smoothedRttMs ?? 60);
  const type = (c.effectiveType || (down > 20 ? "fast" : "link")).toUpperCase();
  return { down, rtt, type };
}

/** `"1.3 Mb/s · 745 ms · LINK"`, or bare `"offline"` when `online` is
 * false (see the file-header note on why this differs from the
 * prototype's own concatenation). */
export function formatReadout(sample: NetSample, online: boolean): string {
  if (!online) return "offline";
  return `${sample.down.toFixed(1)} Mb/s · ${sample.rtt} ms · ${sample.type}`;
}

/** Smooths a new round-trip sample into the running RTT estimate, 0.6/0.4
 * (reference `probe()`: `this._rtt * 0.6 + ms * 0.4`, rounded). */
export function smoothRtt(previous: number | null, sampleMs: number): number {
  return Math.round(previous ? previous * 0.6 + sampleMs * 0.4 : sampleMs);
}

/** `q = log10(1+Mbps)/log10(51)`, clamped to [0,1] — README "Mapping". */
export function qFromDown(downMbps: number): number {
  return clamp(Math.log10(1 + downMbps) / Math.log10(51), 0, 1);
}

/** `lag = clamp((rtt-30)/500, 0, 1)` — README "Mapping". */
export function lagFromRtt(rttMs: number): number {
  return clamp((rttMs - 30) / 500, 0, 1);
}

/** `H = 212 − 212·h^0.85` — README "Hue". */
export function hueForHeight(h: number): number {
  return 212 - 212 * Math.pow(h, 0.85);
}

export interface BarFrameParams {
  index: number;
  barCount: number;
  tSeconds: number;
  env: number;
  cap: number;
  burst: number;
  /** Injected so the ±0.025-ish jitter term is testable/deterministic;
   * defaults to Math.random in real use. */
  rand?: () => number;
}

/** One bar's height for this frame, [0,1] — reference `startMeter()`'s
 * per-bar `tick()` body: three detuned sines (env-scaled wobble) plus the
 * probe-injected travelling burst (gaussian centered at 0.62·barCount,
 * width 9) plus jitter, clamped to `[0.07, cap]`. */
export function barHeight({ index: i, barCount, tSeconds: t, env, cap, burst, rand = Math.random }: BarFrameParams): number {
  const wob =
    Math.sin(t * (1.15 + i * 0.07) + i * 1.7) * 0.5 +
    Math.sin(t * (0.55 + i * 0.031) + i * 0.9) * 0.32 +
    Math.sin(t * 3.4 + i * 0.55) * 0.18;
  const peak = burst * 0.4 * Math.exp(-Math.pow((i - barCount * 0.62) / 9, 2));
  let h = env * (0.5 + 0.8 * wob) + peak + (rand() - 0.5) * 0.05;
  h = Math.max(0.07, Math.min(cap, h));
  return h;
}

/** Bar fill: `repeating-linear-gradient(to top, hsl(H 92% 55%) 0 3px,
 * rgba(9,13,18,.85) 3px 4px)` — the 1px gap gives the segmented LED look
 * (README). */
export function barBackground(hue: number): string {
  return `repeating-linear-gradient(to top, hsl(${hue.toFixed(0)} 92% 55%) 0 3px, rgba(9,13,18,.85) 3px 4px)`;
}

/** `box-shadow: 0 0 6px hsl(H 92% 55% / .5)` above h>0.7, else "none". */
export function barBoxShadow(h: number, hue: number): string {
  return h > 0.7 ? `0 0 6px hsl(${hue.toFixed(0)} 92% 55% / .5)` : "none";
}
