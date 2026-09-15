<script lang="ts">
  // Radar-map wallpaper (reference/Homepage.dc.html lines 38-117), shared
  // by every view: dot grid, map labels, range rings, crosshair, conic
  // sweep, origin glyph, subject cards, command box, and the two ASCII HUD
  // panels.
  //
  // The markup itself never changes across views — only its
  // container's opacity does (full at the tracker view, reduced/blurred
  // elsewhere).
  import type { TrackerData, Subject } from "../lib/data";
  import type { ViewId } from "../lib/views";

  interface Props {
    tracker: TrackerData;
    view: ViewId;
    /** True while the detached HOST shell is showing fullscreen over this
     * same wallpaper; dims it well below any attached view's own opacity
     * and overrides every `view`-keyed opacity knob below.
     *
     * Defaults to false. */
    dim?: boolean;
    /** Whether the focused PANE (not just the window's `view`) is actually
     * running retina-v — false in a split window where a sibling shell pane
     * has focus.
     *
     * Defaults to `view === "retina-v"` for single-pane windows. */
    isRetinaFocused?: boolean;
  }

  const { tracker, view, dim = false, isRetinaFocused = view === "retina-v" }: Props = $props();

  // wallOpacity/wallFilter: shared across every windowed view so the
  // tracker map stays visible but subordinate to each view's own chrome;
  // retina-v shows the map at full strength since the map IS that view's
  // content; the detached host shell dims further still via `dim`.
  const NON_TRACKER_OPACITY = 0.85;
  const NON_TRACKER_FILTER = "blur(6px) brightness(.55)";
  const wallOpacity = $derived(dim ? 0.14 : view === "retina-v" ? 1 : NON_TRACKER_OPACITY);
  const wallFilter = $derived(
    dim ? "brightness(0.35)" : view === "retina-v" ? "none" : NON_TRACKER_FILTER,
  );

  const MAP_W = "min(1100px,92vw)";
  const MAP_H = "min(600px,calc(100vh - 340px))";

  const APPEARANCE = {
    none: {
      color: "#8fd0f5",
      border: "1px solid rgba(106,169,221,.75)",
      bg: "rgba(106,169,221,.08)",
      ping: "1px solid rgba(106,169,221,.55)",
      iconColor: "#7cc0f0",
      iconW: 22,
      iconH: 32,
      iconAsset: "spiderman.svg",
      sigColor: "rgba(140,200,240,.6)",
    },
    high: {
      color: "#ff6b6f",
      border: "1px dashed rgba(255,107,111,.85)",
      bg: "rgba(255,107,111,.08)",
      ping: "1px solid rgba(255,90,95,.6)",
      iconColor: "#ff6b6f",
      iconW: 30,
      iconH: 26,
      iconAsset: "flerken.svg",
      sigColor: "rgba(255,107,111,.65)",
    },
  } as const;

  function isReversed(i: number): boolean {
    return i === 1;
  }

  function cardPosition(subject: Subject, reversed: boolean): string {
    if (reversed) {
      return (
        `position:absolute;left:calc(50% + ${subject.leftFrac} * ${MAP_W});` +
        `transform:translate(-32px,calc(-100% - 14px));` +
        `top:calc(48% + ${subject.topFrac} * ${MAP_H})`
      );
    }
    return (
      `position:absolute;left:calc(50% + ${subject.leftFrac} * ${MAP_W} - 32px);` +
      `top:calc(48% + ${subject.topFrac} * ${MAP_H} - 66px)`
    );
  }
</script>

<div style="position:absolute;inset:0;pointer-events:none">
  <div
    data-testid="wallpaper-layer"
    style="position:absolute;inset:0;opacity:{wallOpacity};filter:{wallFilter}"
  >
    <div
      style="position:absolute;inset:0;background-image:radial-gradient(rgba(196,216,232,.16) 1px,transparent 1px);background-size:26px 26px"
    ></div>

    <div
      style="position:absolute;left:50%;top:48%;width:{MAP_W};height:{MAP_H};transform:translate(-50%,-50%);font-size:11px"
    >
      <div style="position:absolute;left:2%;top:1%;color:rgba(224,69,60,.5);letter-spacing:.1em">
        {tracker.map.title}
      </div>

      <div
        style="position:absolute;left:{tracker.map.capital.left}%;top:{tracker.map.capital
          .top}%;display:flex;align-items:center;gap:6px;color:#ff6b6f;letter-spacing:.06em;white-space:nowrap"
      >
        <span
          style="width:13px;height:13px;background:#ff4a4a;mask:url(/assets/pin-target.svg) center/contain no-repeat;-webkit-mask:url(/assets/pin-target.svg) center/contain no-repeat;display:block"
        ></span>{tracker.map.capital.label}
      </div>

      {#each tracker.map.cities as city (city.label)}
        <div
          style="position:absolute;left:{city.left}%;top:{city.top}%;display:flex;align-items:center;gap:5px;color:rgba(196,216,232,.62);white-space:nowrap"
        >
          <span
            style="width:10px;height:13px;background:rgba(196,216,232,.62);mask:url(/assets/pin.svg) center/contain no-repeat;-webkit-mask:url(/assets/pin.svg) center/contain no-repeat;display:block"
          ></span>{city.label}
        </div>
      {/each}

      {#each tracker.map.mountains as mountain (mountain.label)}
        <div
          style="position:absolute;left:{mountain.left}%;top:{mountain.top}%;color:rgba(217,176,74,.8);white-space:nowrap"
        >
          {mountain.label}
        </div>
      {/each}

      {#each tracker.map.forests as forest (forest.label)}
        <div
          style="position:absolute;left:{forest.left}%;top:{forest.top}%;color:rgba(111,191,127,.8);white-space:nowrap"
        >
          {forest.label}
        </div>
      {/each}

      {#each tracker.map.rivers as river (river.label)}
        <div
          style="position:absolute;left:{river.left}%;top:{river.top}%;color:rgba(106,169,221,.8);white-space:nowrap"
        >
          {river.label}
        </div>
      {/each}
    </div>

    <div
      style="position:absolute;left:50%;top:48%;width:320px;height:320px;transform:translate(-50%,-50%);border:1px solid rgba(224,69,60,.24);border-radius:50%"
    ></div>
    <div
      style="position:absolute;left:50%;top:48%;width:620px;height:620px;transform:translate(-50%,-50%);border:1px solid rgba(224,69,60,.18);border-radius:50%"
    ></div>
    <div
      style="position:absolute;left:50%;top:48%;width:980px;height:980px;transform:translate(-50%,-50%);border:1px dashed rgba(224,69,60,.12);border-radius:50%"
    ></div>
    <div
      style="position:absolute;left:50%;top:48%;width:1400px;height:1400px;transform:translate(-50%,-50%);border:1px solid rgba(224,69,60,.07);border-radius:50%"
    ></div>

    <div
      style="position:absolute;left:0;right:0;top:48%;height:1px;background:rgba(224,69,60,.12)"
    ></div>
    <div
      style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:rgba(224,69,60,.12)"
    ></div>

    <div
      style="position:absolute;left:50%;top:48%;width:1400px;height:1400px;margin:-700px 0 0 -700px;border-radius:50%;pointer-events:none;mix-blend-mode:screen;background:conic-gradient(from 90deg,rgba(224,69,60,.28) 0deg,rgba(224,69,60,.16) 6deg,rgba(224,69,60,.075) 22deg,rgba(224,69,60,.028) 48deg,rgba(224,69,60,0) 96deg,rgba(224,69,60,0) 360deg);mask:radial-gradient(circle at 50% 50%,#000 0,#000 12%,rgba(0,0,0,.72) 23%,rgba(0,0,0,.34) 34%,rgba(0,0,0,.14) 46%,rgba(0,0,0,.05) 62%,transparent 82%);-webkit-mask:radial-gradient(circle at 50% 50%,#000 0,#000 12%,rgba(0,0,0,.72) 23%,rgba(0,0,0,.34) 34%,rgba(0,0,0,.14) 46%,rgba(0,0,0,.05) 62%,transparent 82%);animation:swp 9s linear infinite"
    ></div>
    <div
      style="position:absolute;left:50%;top:48%;width:700px;height:1px;transform-origin:0 50%;background:linear-gradient(90deg,rgba(255,150,140,.9),rgba(255,150,140,.55) 14%,rgba(224,69,60,.28) 32%,rgba(224,69,60,.08) 52%,rgba(224,69,60,0) 78%);box-shadow:0 0 6px rgba(224,69,60,.35);animation:swp 9s linear infinite"
    ></div>

    <div
      style="position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);font-size:15px;color:#e0453c"
    >
      {tracker.map.origin.glyph}
    </div>
    <div
      style="position:absolute;left:50%;top:48%;transform:translate(-60px,60px);font-size:11px;letter-spacing:.14em;color:rgba(224,69,60,.75)"
    >
      {tracker.map.origin.label}
    </div>

    {#each tracker.subjects as subject, i (subject.id)}
      {@const reversed = isReversed(i)}
      {@const a = APPEARANCE[subject.threat]}
      <div
        style="{cardPosition(subject, reversed)};color:{a.color};display:flex;{reversed
          ? 'flex-direction:column-reverse;align-items:flex-start;gap:4px'
          : 'align-items:center;gap:9px'}"
      >
        <div
          style="position:relative;width:64px;height:52px;border:{a.border};border-radius:3px;display:flex;align-items:center;justify-content:center;background:{a.bg}"
        >
          <span
            style="position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border:{a.ping};border-radius:50%;animation:png 3.6s cubic-bezier(.2,.6,.4,1) infinite;pointer-events:none"
          ></span>
          <span
            style="position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border:{a.ping};border-radius:50%;animation:png 3.6s cubic-bezier(.2,.6,.4,1) infinite;animation-delay:1.8s;pointer-events:none"
          ></span>
          <span
            style="position:relative;width:{a.iconW}px;height:{a.iconH}px;background:{a.iconColor};mask:url(/assets/{a.iconAsset}) center/contain no-repeat;-webkit-mask:url(/assets/{a.iconAsset}) center/contain no-repeat;display:block"
          ></span>
        </div>
        <div>
          <div style="font-size:11px;letter-spacing:.12em;color:{a.color}">{subject.label}</div>
          <div style="font-size:11px;color:{a.sigColor}">{subject.sig}</div>
        </div>
      </div>
    {/each}

    <div
      style="position:absolute;left:30px;top:24px;background:rgba(9,13,18,.78);border:1px solid rgba(224,69,60,.22);border-radius:4px;padding:8px 12px;display:flex;flex-direction:column;gap:4px"
    >
      <div style="font-size:12px;color:rgba(224,69,60,.85)">
        {tracker.commandBox.commandLine}<span
          style="display:inline-block;width:7px;height:13px;margin-left:5px;vertical-align:-2px;background:rgba(224,69,60,.85);animation:blk 1.1s steps(1) infinite"
        ></span>
      </div>
      <div style="font-size:12px;color:rgba(196,216,232,.45)">{tracker.commandBox.statusLine}</div>
    </div>

    <!-- CopyMode's "tracker readout/HUD"
         data-copy-source, gated to the tracker view only (this markup is
         always in the DOM at every view, just faded via wallOpacity above)
         so `Ctrl-b [` never captures the HUD text while some other view is
         active. Gated on the *focused pane* running
         retina-v (isRetinaFocused), not merely the window's view, so a split
         retina-v window with a shell pane focused doesn't let CopyMode
         capture the HUD out from under the focused shell. -->
    <pre
      data-copy-source={isRetinaFocused ? "" : undefined}
      style="position:absolute;left:30px;bottom:56px;margin:0;font:12px/1.5 inherit;color:rgba(224,69,60,.6);background:rgba(9,13,18,.78);border:1px solid rgba(224,69,60,.22);border-radius:4px;padding:8px 12px">{tracker.hud.left.join(
        "\n",
      )}</pre>

    <pre
      style="position:absolute;right:30px;bottom:56px;margin:0;font:12px/1.5 inherit;color:rgba(196,216,232,.4);text-align:right;background:rgba(9,13,18,.78);border:1px solid rgba(224,69,60,.22);border-radius:4px;padding:8px 12px">{tracker.hud.right.join(
        "\n",
      )}</pre>
  </div>
</div>
