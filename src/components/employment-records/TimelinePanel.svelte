<script lang="ts">
  // Middle column: vertical service-history timeline hanging off a
  // spiderweb glyph, one node per record (newest at the top, oldest = 1).
  // Layout/values verbatim from UI-Mockups/builds-page-design-review/
  // Personnel.dc.html's MIDDLE column (lines 102-130). Only four of the
  // mockup's seven keyframes are live here (`spin`/`rspin`/`spark`/`dash`) —
  // `pls`/`blink`/`webglow` are dead in the source file itself (Personnel-
  // Panel-Changes.md's animation inventory) and are not ported.
  //
  // All four infinite keyframe animations run live in every build,
  // fixture included (Phase 7b.1) — golden determinism comes from
  // Playwright's capture-time `animations:"disabled"` alone, not from a
  // fixtureMode gate. The continuous *transitions* (marker/ring/dot easing
  // on selection change) are unrelated either way: they only ever fire on
  // a selection change, and fixture/golden captures never trigger one
  // mid-capture.
  import type { EmploymentRecordsState } from "./employmentRecordsState.svelte";

  interface Props {
    state: EmploymentRecordsState;
  }

  const { state }: Props = $props();

  const markerTop = $derived(
    state.records.length > 0 ? `${((state.sel + 0.5) / state.records.length) * 100}%` : "50%",
  );
</script>

<div style="position:relative;width:188px;flex:none;margin:0 10px">
  <div style="position:absolute;left:50%;top:2px;transform:translateX(-50%);width:112px;height:54px;overflow:hidden;pointer-events:none">
    <img src="/assets/spider-web-red.svg" alt="" aria-hidden="true" style="width:112px;height:108px;display:block;opacity:.55" />
  </div>

  <div style="position:absolute;left:50%;top:56px;bottom:16px;width:1px;transform:translateX(-50%);background:rgba(224,69,60,.55)"></div>
  <div style="position:absolute;left:50%;top:56px;bottom:16px;width:3px;transform:translateX(-50%);overflow:hidden">
    <div
      data-testid="employment-timeline-spark"
      style="position:absolute;left:0;right:0;height:34px;background:linear-gradient(180deg,rgba(140,220,255,0),rgba(140,220,255,.9),rgba(140,220,255,0));animation:spark 4.6s linear infinite"
    ></div>
  </div>

  <div style="position:absolute;inset:56px 0 16px;pointer-events:none">
    <div
      style="position:absolute;left:50%;top:{markerTop};transform:translate(-50%,-50%);width:78px;height:78px;border-radius:50%;background:radial-gradient(circle,rgba(224,69,60,.2),rgba(224,69,60,0) 70%);transition:top .45s cubic-bezier(.2,.75,.2,1)"
    ></div>
    <div
      data-testid="employment-timeline-dash"
      style="position:absolute;left:0;width:calc(50% - 32px);top:{markerTop};height:1px;background:repeating-linear-gradient(90deg,rgba(224,69,60,.75) 0 8px,rgba(224,69,60,0) 8px 16px);background-size:24px 1px;animation:dash .9s linear infinite;transition:top .45s cubic-bezier(.2,.75,.2,1)"
    ></div>
    <div
      data-testid="employment-timeline-dash"
      style="position:absolute;right:0;width:calc(50% - 32px);top:{markerTop};height:1px;background:repeating-linear-gradient(90deg,rgba(224,69,60,.75) 0 8px,rgba(224,69,60,0) 8px 16px);background-size:24px 1px;animation:dash .9s linear infinite reverse;transition:top .45s cubic-bezier(.2,.75,.2,1)"
    ></div>
  </div>

  <div style="position:absolute;inset:56px 0 16px;display:grid;grid-template-rows:repeat({state.records.length},1fr)">
    {#each state.records as row, i (row.entry.id)}
      {@const on = i === state.sel}
      {@const pos = state.records.length - i}
      <div
        role="button"
        tabindex="0"
        data-testid="employment-timeline-node"
        data-node-pos={pos}
        onclick={() => state.select(i)}
        onkeydown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") state.select(i);
        }}
        style="position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer"
      >
        <span
          style="position:absolute;right:calc(50% + 32px);text-align:right;white-space:nowrap;font-size:11px;letter-spacing:.04em;color:{on
            ? '#ff8f93'
            : 'rgba(196,216,232,.38)'};transition:color .3s"
        >
          {row.start.y}
        </span>
        <span style="position:absolute;left:calc(50% + 32px);display:flex;flex-direction:column;line-height:1.25;white-space:nowrap">
          <span style="font-size:11px;color:{on ? 'rgba(217,176,74,.95)' : 'rgba(196,216,232,.28)'};transition:color .3s"
            >{row.months}mo</span
          >
          <span style="font-size:9.5px;letter-spacing:.06em;color:{row.live ? 'rgba(95,198,180,.6)' : 'rgba(196,216,232,.2)'}"
            >{row.live ? "active" : "ended"}</span
          >
        </span>
        <span
          data-testid="employment-timeline-ring-spin"
          style="position:absolute;width:{on ? '54px' : '30px'};height:{on
            ? '54px'
            : '30px'};border-radius:50%;border:1px dashed {on
            ? 'rgba(224,69,60,.85)'
            : 'rgba(140,200,240,.2)'};animation:spin {on ? '9s' : '24s'} linear infinite;transition:width .4s,height .4s"
        ></span>
        <span
          data-testid="employment-timeline-ring-rspin"
          style="position:absolute;width:{on ? '40px' : '24px'};height:{on
            ? '40px'
            : '24px'};border-radius:50%;border:1px solid {on
            ? 'rgba(140,220,255,.6)'
            : 'rgba(140,200,240,.12)'};animation:rspin 14s linear infinite;transition:width .4s,height .4s"
        ></span>
        <span
          data-testid="employment-timeline-dot"
          style="position:relative;width:{on ? '30px' : '19px'};height:{on
            ? '30px'
            : '19px'};border-radius:50%;background:{on
            ? 'radial-gradient(circle at 35% 30%,#8fe3ff,#4a9fe0 55%,#e0453c)'
            : 'rgba(11,15,20,.85)'};border:1px solid {on
            ? 'rgba(255,180,175,.7)'
            : 'rgba(140,200,240,.3)'};box-shadow:{on
            ? '0 0 18px rgba(224,69,60,.55),0 0 34px rgba(74,159,224,.28)'
            : 'none'};display:flex;align-items:center;justify-content:center;font-size:{on
            ? '12.5px'
            : '10.5px'};font-weight:700;color:{on ? '#0b0f14' : 'rgba(196,216,232,.5)'};transition:width .4s,height .4s,background .3s,color .3s"
        >
          {pos}
        </span>
      </div>
    {/each}
  </div>
</div>

<style>
  /* -global- keeps each keyframe resolvable from the inline `animation:`
     reference above: Svelte scopes a plain `@keyframes` declared in a
     component <style> block by renaming it, but never rewrites an
     `animation:` value written in markup, so the inline reference would
     otherwise point at a name that no longer exists. */
  @keyframes -global-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes -global-rspin {
    to {
      transform: rotate(-360deg);
    }
  }
  @keyframes -global-spark {
    0% {
      top: -6%;
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    88% {
      opacity: 1;
    }
    100% {
      top: 102%;
      opacity: 0;
    }
  }
  @keyframes -global-dash {
    to {
      background-position: 24px 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-testid="employment-timeline-spark"],
    [data-testid="employment-timeline-dash"],
    [data-testid="employment-timeline-ring-spin"],
    [data-testid="employment-timeline-ring-rspin"] {
      animation: none !important;
    }
  }
</style>
