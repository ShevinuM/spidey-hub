<script lang="ts">
  // Retina-V (tracker) view chrome: the dismissible "back to dashboard" pill
  // (design/Homepage.dc.html lines 173-181). The wallpaper itself (map,
  // rings, sweep, subjects, HUD) is shared markup rendered by
  // Wallpaper.svelte at full opacity for this view (Phase 3); this
  // component only adds the pill that floats above it.
  //
  // `showBack` is local component state, not lifted to Terminal.svelte: the
  // prototype's `offBack` flag lives in top-level state but is explicitly
  // reset to `false` every time the tracker view is entered (Component
  // state initializer `offBack: false`, and both `open("tracker")` and the
  // in-Builds `t` handler set `offBack: false` alongside the view change —
  // Homepage.dc.html lines 469, 897, 1004). Terminal.svelte mounts this
  // component fresh only while `view === "retina-v"` (an `{#if}`, not a
  // `display:none` toggle), so a plain `$state(true)` seed reproduces that
  // "resets on every entry" semantics for free: each mount is a fresh
  // entry, and the pill is dismissed only for the lifetime of that mount.
  import type { TrackerData } from "../lib/data";

  interface Props {
    tracker: TrackerData;
    onGoHome: () => void;
  }

  const { tracker, onGoHome }: Props = $props();

  let showBack = $state(true);

  function hideBack() {
    showBack = false;
  }
</script>

<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:flex-end;padding:22px 26px 16px">
  {#if showBack}
    <div
      data-testid="tracker-back-pill"
      style="display:flex;align-items:center;gap:10px;background:rgba(9,13,18,.72);border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:8px 10px 8px 12px"
    >
      <span
        onclick={onGoHome}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") onGoHome();
        }}
        role="button"
        tabindex="0"
        data-testid="tracker-back-label"
        class="tracker-back-label"
        style="cursor:pointer;font-size:13px;color:rgba(207,216,222,.8)"
      >
        {tracker.backPill.label}
      </span>
      <span
        onclick={hideBack}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") hideBack();
        }}
        role="button"
        tabindex="0"
        data-testid="tracker-back-dismiss"
        class="tracker-back-dismiss"
        style="cursor:pointer;font-size:13px;line-height:1;color:rgba(207,216,222,.45);padding:0 2px"
      >
        {tracker.backPill.dismissGlyph}
      </span>
    </div>
  {/if}
</div>

<style>
  .tracker-back-label:hover {
    color: #e0453c;
  }
  .tracker-back-dismiss:hover {
    color: #ff6b6f;
  }
</style>
