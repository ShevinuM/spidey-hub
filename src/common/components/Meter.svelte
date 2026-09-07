<script lang="ts">
  // SIGNAL row live meter (design/Homepage.dc.html lines 262-267; README
  // "Live meter (SIGNAL row)"; reference `Component` methods `meterRef`/
  // `startMeter`/`stopMeter`/`probe`/`netStats`/`linkSpeed`, lines ~909-978).
  //
  // Renders the 60-bar strip + the readout span (the two live pieces of the
  // SIGNAL row; the "SIGNAL" label and coordinates are static copy owned by
  // Profile.svelte itself). One requestAnimationFrame loop writes each
  // bar's height/background/box-shadow directly onto its DOM node every
  // frame — deliberately NOT through Svelte state/reactivity (README: "do
  // NOT re-render 60 nodes per frame through the framework"). The readout
  // text is the one piece of UI state that *is* plain Svelte state, because
  // it only changes once per 2.5s probe, not once per frame (mirrors the
  // reference's own `setState({netReadout})` only inside `probe()`).
  //
  // Gated by the same desktop/fine-pointer matchMedia guard as every other
  // timer/listener in the app (README "Mobile policy"; StatusBar.svelte's
  // clock effect is the precedent this mirrors) — no rAF loop or interval
  // is ever started in blocked mode.
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
    type NetConnectionLike,
  } from "../../features/profile/lib/net";

  interface Props {
    initialReadout: string;
  }

  const { initialReadout }: Props = $props();

  const BAR_COUNT = 60;
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => i);

  let barsEl = $state<HTMLDivElement | null>(null);
  // Uncontrolled seed, same documented pattern as Terminal.svelte's
  // `view = $state(initialView)`: `initialReadout` is only ever meant to
  // paint the very first frame before the first probe resolves (mirrors
  // the reference's `this.state.netReadout || "measuring…"`); every
  // update after that comes from `probe()` reassigning this variable
  // directly, never from the prop changing.
  // svelte-ignore state_referenced_locally
  let netReadout = $state(initialReadout);

  $effect(() => {
    const mq = window.matchMedia("(min-width: 900px) and (pointer: fine)");
    if (!mq.matches) return;
    const el = barsEl;
    if (!el) return;

    let raf = 0;
    let measuredMbps: number | null = null;
    let smoothedRtt: number | null = null;
    let burst = 1;

    const connection = (): NetConnectionLike | undefined =>
      (navigator as Navigator & { connection?: NetConnectionLike }).connection;

    const measureThroughput = (): number | null => {
      const all = [
        ...performance.getEntriesByType("resource"),
        ...performance.getEntriesByType("navigation"),
      ] as PerformanceResourceTiming[];
      return computeThroughputMbps(all);
    };

    const probe = () => {
      const t0 = performance.now();
      const img = new Image();
      const done = () => {
        smoothedRtt = smoothRtt(smoothedRtt, performance.now() - t0);
        measuredMbps = measureThroughput();
        burst = 1;
        const sample = netStats(connection(), measuredMbps, smoothedRtt);
        const readout = formatReadout(sample, navigator.onLine !== false);
        if (readout !== netReadout) netReadout = readout;
      };
      img.onload = done;
      img.onerror = done;
      img.src = "/assets/icon-mail.svg?t=" + Math.round(t0);
    };

    probe();
    const probeInterval = setInterval(probe, 2500);

    const tick = () => {
      const sample = netStats(connection(), measuredMbps, smoothedRtt);
      const q = qFromDown(sample.down);
      const lag = lagFromRtt(sample.rtt);
      const env = 0.36 + 0.5 * q;
      const cap = 1 - 0.18 * lag;
      const t = (performance.now() / 1000) * (1 - 0.35 * lag);
      burst *= 0.94;

      const children = el.children;
      for (let i = 0; i < children.length; i++) {
        const h = barHeight({ index: i, barCount: children.length, tSeconds: t, env, cap, burst });
        const hue = hueForHeight(h);
        const bar = children[i] as HTMLElement;
        bar.style.height = (h * 100).toFixed(1) + "%";
        bar.style.background = barBackground(hue);
        bar.style.boxShadow = barBoxShadow(h, hue);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(probeInterval);
    };
  });
</script>

<div
  bind:this={barsEl}
  data-testid="signal-meter-bars"
  style="flex:1;min-width:0;height:26px;display:flex;align-items: flex-end;gap:2px;overflow: hidden"
>
  {#each bars as i (i)}
    <div
      data-testid="signal-meter-bar"
      style="flex:1;min-width:0;height:8%;border-radius:1px;background:#2a5f7a"
    ></div>
  {/each}
</div>
<span
  data-testid="signal-net-readout"
  style="flex:none;color:rgba(196,216,232,.62);font-variant-numeric: tabular-nums"
>
  {netReadout}
</span>
