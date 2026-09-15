// `formatReadout` below deliberately returns bare `"offline"` instead of
// the reference `probe()`'s `"offline · N ms · TYPE"` concatenation,
// matching profile.spec.ts's anchored e2e status regex.

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export interface ResourceTimingEntry {
  transferSize: number;
  duration: number;
}

/** Mirrors the reference `linkSpeed()`, floored at 0.2 Mb/s. */
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

/** Ports the reference `netStats()`, including its hardcoded pre-measurement defaults (5 Mb/s, 60ms). */
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

/** One bar's height for this frame, [0,1] — mirrors the reference `startMeter()`'s per-bar `tick()` body. */
export function barHeight({
  index: i,
  barCount,
  tSeconds: t,
  env,
  cap,
  burst,
  rand = Math.random,
}: BarFrameParams): number {
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
