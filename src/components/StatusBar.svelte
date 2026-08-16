<script lang="ts">
  // tmux-style status bar (design/Homepage.dc.html lines 443-461).
  //
  // Bug fix 1: the prototype appends the active Retina-V window *after*
  // profile ("...4:profile 3:retina-v*") instead of rendering it in place.
  // We always render windows 1-4 in numeric order (as authored in
  // site.yaml) and simply highlight whichever one is active, in place.
  //
  // Bug fix 2: the prototype hardcodes "23:34" / "15-Aug-26". We render a
  // live local clock, filled immediately on mount and refreshed on a
  // minute-aligned timer, gated by the same desktop/fine-pointer guard as
  // every other listener/timer in the app (README "Mobile policy").
  import type { SiteData } from "../lib/data";
  import type { ViewId } from "../lib/views";
  import { activeWindowId } from "../lib/views";
  import { formatClockDate, formatClockTime, msUntilNextMinute } from "../lib/clock";

  interface Props {
    site: SiteData;
    view: ViewId;
  }

  const { site, view }: Props = $props();

  const active = $derived(activeWindowId(view));

  let clockTime = $state("");
  let clockDate = $state("");

  function paintClock() {
    const now = new Date();
    clockTime = formatClockTime(now);
    clockDate = formatClockDate(now);
  }

  $effect(() => {
    const mq = window.matchMedia("(min-width: 900px) and (pointer: fine)");
    if (!mq.matches) return;

    paintClock();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        paintClock();
        schedule();
      }, msUntilNextMinute(new Date()));
    };
    schedule();

    return () => clearTimeout(timer);
  });
</script>

<div style="height:30px;flex:none;display:flex;align-items:center;background:#0d2a2f;font-size:14px">
  <div style="flex:none;padding:0 8px;color:#7fd8a8;letter-spacing:.02em;white-space:nowrap">
    {site.statusBar.session}
  </div>
  <div style="color:rgba(127,216,200,.45)">{site.statusBar.separator}</div>
  <div
    data-testid="status-bar-windows"
    style="display:flex;align-items:center;gap:8px;padding:0 8px;color:#5fc6b4;white-space:nowrap;flex:0 0 auto"
  >
    {#each site.statusBar.windows as win (win.id)}
      {#if win.id === active}
        <span style="background:#e0453c;color:#0b0f14;padding:0 6px">{win.number}:{win.name}*</span>
      {:else}
        <span>{win.number}:{win.name}</span>
      {/if}
    {/each}
  </div>
  <div style="flex:1"></div>
  <div style="flex:none;display:flex;gap:12px;padding:0 14px;white-space:nowrap">
    <span style="color:rgba(95,198,180,.75)">{site.statusBar.grepHint}</span>
    <span data-testid="status-bar-clock-time" style="color:#d7a3e0">{clockTime}</span>
    <span data-testid="status-bar-clock-date" style="color:#c98fd0">{clockDate}</span>
  </div>
</div>
