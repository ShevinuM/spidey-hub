<script lang="ts">
  // E.D.I.T.H boot sequence overlay; on-screen text comes from `BootData`
  // (content/boot.yaml + content/log.md) — this file renders geometry and
  // data, never hardcodes copy.
  //
  // Always mounted by Terminal.svelte via a `bind:this` ref
  // (`replay()`/`isActive()`), so it owns its own phase state machine and
  // Terminal can gate all key handling on `isActive()` ahead of every other
  // overlay — there is no key or click that reaches the site underneath
  // while it's running.
  //
  // While `booting` is true this renders an opaque `position:fixed;inset:0`
  // layer at z-index 100, above GrepOverlay (40) and CopyMode (50), since
  // boot covers the status bar too: there is no session chrome yet to peek
  // through.
  import { untrack } from "svelte";
  import type { BootData, BootStatusRow } from "../../../common/lib/data";
  import {
    bootDuration,
    handshakeText,
    logRows as computeLogRows,
    pct as computePct,
    phaseLabel,
    progFillStyle,
    progress as computeProgress,
    statusRowValue,
  } from "../lib/boot";
  import { hasBootPlayed, markBootPlayed } from "../lib/boot-state";

  interface Props {
    boot: BootData;
    desktopMode: boolean;
    /** Fired once when a real (non-skipped) boot hands off to ready; never
     * fires on the skip path. */
    onReady?: () => void;
  }

  const { boot, desktopMode, onReady }: Props = $props();

  type Phase = "boot" | "out" | "ready";

  // Read directly in this initializer, not a mount effect: Svelte reruns
  // component setup on client hydration, which is the only way to see the
  // real (post-SSR) sessionStorage value rather than the SSR pass's always-
  // false default.
  let phase = $state<Phase>(hasBootPlayed() ? "ready" : "boot");
  // Rendered as `data-elapsed`, a plain diagnostic number that tests read
  // back to derive expectations from wherever the fake clock actually
  // landed, since Playwright's clock keeps ticking in real time after any
  // control call.
  let elapsed = $state(0);

  // Testability marker only: `data-boot-running` flips true synchronously
  // inside `run()`, giving tests a deterministic point to wait for before
  // advancing a fake clock — the overlay itself can mount before the
  // `$effect` below calls `run()`, so waiting on visibility alone risks
  // racing ahead of `t0` being captured.
  let running = $state(false);

  let t0 = 0;
  let tick: ReturnType<typeof setInterval> | undefined;
  let hardStop: ReturnType<typeof setTimeout> | undefined;
  let outTimer: ReturnType<typeof setTimeout> | undefined;

  // Outro hold before flipping from "out" to "ready".
  const OUT_MS = 760;

  function dur(): number {
    return bootDuration(boot.bootMs);
  }

  // Uses wall-clock Date.now() + a 33ms setInterval, not
  // requestAnimationFrame: rAF pauses in a backgrounded tab, which would
  // freeze the boot mid-sequence (the hard-stop timeout guarantees hand-off
  // regardless), and this keeps the sequence controllable by Playwright's
  // fake clock, which drives setInterval/setTimeout but not rAF.
  function run() {
    running = true;
    t0 = Date.now();
    clearInterval(tick);
    tick = setInterval(() => {
      const e = Date.now() - t0;
      if (e >= dur()) finish();
      else elapsed = e;
    }, 33);
    clearTimeout(hardStop);
    hardStop = setTimeout(finish, dur() + 60);
  }

  function finish() {
    clearInterval(tick);
    clearTimeout(hardStop);
    if (phase !== "boot") return;
    elapsed = dur();
    phase = "out";
    clearTimeout(outTimer);
    outTimer = setTimeout(() => {
      phase = "ready";
      onReady?.();
    }, OUT_MS);
  }

  /** Always plays a full boot regardless of the sessionStorage flag —
   * replay is a manual, repeatable action, not a second "first load". */
  export function replay(): void {
    clearInterval(tick);
    clearTimeout(hardStop);
    clearTimeout(outTimer);
    elapsed = 0;
    phase = "boot";
    run();
  }

  /** Terminal.svelte's global key gate: true for both "boot" and "out" —
   * the outro bloom is still part of the unskippable sequence. */
  export function isActive(): boolean {
    return phase !== "ready";
  }

  // Gated to desktopMode like every other timer/listener in the app.
  //
  // `untrack` on the `phase` read is load-bearing: without it, the write to
  // `phase` from finish()/replay() (called outside this effect) would
  // re-run the effect and clear the timer finish() just created before it
  // fires, silently killing the hand-off to "ready".
  $effect(() => {
    if (!desktopMode) return;
    untrack(() => {
      if (phase === "boot") {
        markBootPlayed();
        run();
      }
    });
    return () => {
      clearInterval(tick);
      clearTimeout(hardStop);
      clearTimeout(outTimer);
    };
  });

  const p = $derived(computeProgress(elapsed, dur()));
  const pctValue = $derived(computePct(elapsed, dur()));
  const pctText = $derived(pctValue + "%");
  const phaseText = $derived(phaseLabel(pctValue, boot.phaseLabels));
  const handshake = $derived(handshakeText(p, elapsed, boot.handshake));
  const progFill = $derived(progFillStyle(pctValue));
  const rows = $derived(computeLogRows(p, boot.log));
  const tint = $derived(boot.tints[boot.coreTint] ?? boot.tints.cyan);
  const commandLine = $derived(boot.commandLineTemplate.replace("{session}", boot.sessionId));
  const outroing = $derived(phase === "out");
  const booting = $derived(phase !== "ready");

  function statusRowText(row: BootStatusRow): string {
    return row.prefix + statusRowValue(pctValue, row) + boot.statusBox.rowSuffix;
  }

  const statusBoxText = $derived(
    [boot.statusBox.top, ...boot.statusBox.rows.map(statusRowText), boot.statusBox.bottom].join(
      "\n",
    ),
  );
</script>

{#if booting}
  <div
    data-testid="boot-sequence"
    data-boot-running={running}
    data-elapsed={elapsed}
    style="position:fixed;inset:0;z-index:100;background:#0b0f14;overflow:hidden;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;color:#c9d1d9"
  >
    <div
      style="position:absolute;inset:0;background-image:radial-gradient(rgba(196,216,232,.13) 1px,transparent 1px);background-size:26px 26px;animation:bIn 1.2s ease-out both"
    ></div>
    <div
      style="position:absolute;inset:0;background:radial-gradient(circle at 50% 47%,rgba(224,69,60,.05),rgba(11,15,20,0) 46%,rgba(6,9,13,.72) 100%)"
    ></div>
    <div
      style="position:absolute;left:0;right:0;height:34vh;pointer-events:none;background:linear-gradient(180deg,rgba(95,198,180,0),rgba(95,198,180,.045),rgba(95,198,180,0));animation:bScan 5.2s linear infinite"
    ></div>

    <div
      style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);container-type:size;width:max(250px,min(660px,calc(100vh - 312px),86vw));height:max(250px,min(660px,calc(100vh - 312px),86vw));animation:bAsmIn 1.15s cubic-bezier(.2,.7,.3,1) both"
    >
      <div
        style="position:absolute;inset:0;margin:auto;width:100%;height:100%;border-radius:50%;border:1px solid rgba(224,69,60,.12);animation:bIn .8s ease-out .04s both"
      ></div>
      <div
        style="position:absolute;inset:0;margin:auto;width:93%;height:93%;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(224,69,60,.55) 0 .28deg,rgba(224,69,60,0) .28deg 3.6deg);mask:radial-gradient(circle,transparent 0 calc(50% - 7px),#000 calc(50% - 7px) 50%,transparent 50%);-webkit-mask:radial-gradient(circle,transparent 0 calc(50% - 7px),#000 calc(50% - 7px) 50%,transparent 50%);animation:swp 96s linear infinite,bIn .9s ease-out .1s both"
      ></div>
      <div
        style="position:absolute;inset:0;margin:auto;width:86%;height:86%;border-radius:50%;border:1px dashed rgba(224,69,60,.18);animation:swpR 150s linear infinite,bIn .9s ease-out .18s both"
      ></div>
      <div
        style="position:absolute;inset:0;margin:auto;width:78%;height:78%;border-radius:50%;background:conic-gradient(from 0deg,rgba(224,69,60,.6) 0 26deg,rgba(224,69,60,0) 26deg 88deg,rgba(196,216,232,.3) 88deg 104deg,rgba(224,69,60,0) 104deg 178deg,rgba(224,69,60,.55) 178deg 216deg,rgba(224,69,60,0) 216deg 268deg,rgba(217,176,74,.55) 268deg 288deg,rgba(224,69,60,0) 288deg 360deg);mask:radial-gradient(circle,transparent 0 calc(50% - 3px),#000 calc(50% - 3px) 50%,transparent 50%);-webkit-mask:radial-gradient(circle,transparent 0 calc(50% - 3px),#000 calc(50% - 3px) 50%,transparent 50%);animation:swp 34s linear infinite,bIn .9s ease-out .26s both"
      ></div>

      <div
        style="position:absolute;inset:0;margin:auto;width:68%;height:68%;border-radius:50%;border:1px solid rgba(224,69,60,.14);animation:bIn .9s ease-out .3s both"
      ></div>
      <div style={progFill} data-testid="boot-prog-fill"></div>

      <div
        style="position:absolute;inset:0;margin:auto;width:58%;height:58%;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(143,208,245,.9) 0 1deg,rgba(143,208,245,0) 1deg 5.2deg);mask:radial-gradient(circle,transparent 0 calc(50% - 5px),#000 calc(50% - 5px) 50%,transparent 50%);-webkit-mask:radial-gradient(circle,transparent 0 calc(50% - 5px),#000 calc(50% - 5px) 50%,transparent 50%);animation:swpR 46s linear infinite,bIn .9s ease-out .4s both"
      ></div>
      <div
        style="position:absolute;inset:0;margin:auto;width:48%;height:48%;border-radius:50%;background:conic-gradient(from 208deg,rgba(217,176,74,.9) 0 30deg,rgba(217,176,74,0) 30deg 360deg);mask:radial-gradient(circle,transparent 0 calc(50% - 5px),#000 calc(50% - 5px) 50%,transparent 50%);-webkit-mask:radial-gradient(circle,transparent 0 calc(50% - 5px),#000 calc(50% - 5px) 50%,transparent 50%);animation:swp 19s linear infinite,bIn .9s ease-out .48s both"
      ></div>
      <div
        style="position:absolute;inset:0;margin:auto;width:38%;height:38%;border-radius:50%;border:1px solid rgba(95,198,180,.4);animation:bIn .9s ease-out .52s both"
      ></div>
      <div
        style="position:absolute;inset:0;margin:auto;width:32%;height:32%;border-radius:50%;border:1px dashed rgba(95,198,180,.22);animation:swp 27s linear infinite,bIn .9s ease-out .56s both"
      ></div>

      <div
        style="position:absolute;inset:0;margin:auto;width:100%;height:100%;border-radius:50%;border:1px solid rgba(95,198,180,.55);pointer-events:none;animation:bWave 3.6s cubic-bezier(.15,.6,.3,1) infinite"
      ></div>
      <div
        style="position:absolute;inset:0;margin:auto;width:100%;height:100%;border-radius:50%;border:1px solid rgba(143,208,245,.4);pointer-events:none;animation:bWave 3.6s cubic-bezier(.15,.6,.3,1) .9s infinite"
      ></div>
      <div
        style="position:absolute;inset:0;margin:auto;width:100%;height:100%;border-radius:50%;border:1px dashed rgba(95,198,180,.32);pointer-events:none;animation:bWave 3.6s cubic-bezier(.15,.6,.3,1) 1.8s infinite"
      ></div>
      <div
        style="position:absolute;inset:0;margin:auto;width:100%;height:100%;border-radius:50%;border:1px solid rgba(224,69,60,.34);pointer-events:none;animation:bWave 3.6s cubic-bezier(.15,.6,.3,1) 2.7s infinite"
      ></div>

      <div
        style="position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(224,69,60,.1)"
      ></div>
      <div
        style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:rgba(224,69,60,.1)"
      ></div>

      <div
        style="position:absolute;left:50%;top:-2px;transform:translate(-50%,-100%);font-size:9px;color:rgba(224,69,60,.7)"
      >
        {boot.compass.top}
      </div>
      <div
        style="position:absolute;left:50%;bottom:-2px;transform:translate(-50%,100%);font-size:9px;color:rgba(224,69,60,.7)"
      >
        {boot.compass.bottom}
      </div>
      <div
        style="position:absolute;top:50%;left:-4px;transform:translate(-100%,-50%);font-size:9px;color:rgba(224,69,60,.5)"
      >
        {boot.compass.left}
      </div>
      <div
        style="position:absolute;top:50%;right:-4px;transform:translate(100%,-50%);font-size:9px;color:rgba(224,69,60,.5)"
      >
        {boot.compass.right}
      </div>
      <div
        style="position:absolute;left:52%;top:3%;font-size:9px;letter-spacing:.16em;color:rgba(196,216,232,.32)"
      >
        {boot.compass.degrees[0]}
      </div>
      <div
        style="position:absolute;right:2%;top:51%;font-size:9px;letter-spacing:.16em;color:rgba(196,216,232,.32)"
      >
        {boot.compass.degrees[1]}
      </div>
      <div
        style="position:absolute;left:52%;bottom:2%;font-size:9px;letter-spacing:.16em;color:rgba(196,216,232,.32)"
      >
        {boot.compass.degrees[2]}
      </div>
      <div
        style="position:absolute;left:2%;top:51%;font-size:9px;letter-spacing:.16em;color:rgba(196,216,232,.32)"
      >
        {boot.compass.degrees[3]}
      </div>

      <div
        style="position:absolute;left:93.7%;top:35.8%;width:16px;height:5px;transform:translate(-50%,-50%) rotate(108deg);background:rgba(196,216,232,.32)"
      ></div>
      <div
        style="position:absolute;left:76.4%;top:12.3%;width:11px;height:5px;transform:translate(-50%,-50%) rotate(145deg);background:rgba(224,69,60,.6)"
      ></div>
      <div
        style="position:absolute;left:45.2%;top:4.2%;width:20px;height:4px;transform:translate(-50%,-50%) rotate(186deg);background:rgba(196,216,232,.28)"
      ></div>
      <div
        style="position:absolute;left:20.4%;top:14.8%;width:13px;height:5px;transform:translate(-50%,-50%) rotate(220deg);background:rgba(217,176,74,.6)"
      ></div>
      <div
        style="position:absolute;left:5%;top:40.4%;width:16px;height:5px;transform:translate(-50%,-50%) rotate(258deg);background:rgba(196,216,232,.3)"
      ></div>
      <div
        style="position:absolute;left:8.3%;top:69.5%;width:10px;height:5px;transform:translate(-50%,-50%) rotate(295deg);background:rgba(224,69,60,.55)"
      ></div>
      <div
        style="position:absolute;left:27%;top:89.8%;width:18px;height:4px;transform:translate(-50%,-50%) rotate(330deg);background:rgba(196,216,232,.28)"
      ></div>
      <div
        style="position:absolute;left:61.9%;top:94.4%;width:12px;height:5px;transform:translate(-50%,-50%) rotate(15deg);background:rgba(196,216,232,.32)"
      ></div>
      <div
        style="position:absolute;left:85.2%;top:79.6%;width:15px;height:5px;transform:translate(-50%,-50%) rotate(50deg);background:rgba(143,208,245,.5)"
      ></div>
      <div
        style="position:absolute;left:95.3%;top:58%;width:11px;height:5px;transform:translate(-50%,-50%) rotate(80deg);background:rgba(196,216,232,.3)"
      ></div>

      <div
        style="position:absolute;inset:0;margin:auto;width:30%;height:30%;border-radius:50%;border:1px solid {tint.border};background:radial-gradient(circle at 50% 40%,{tint.glowStart},{tint.glowEnd} 74%);box-shadow:inset 0 0 34px {tint.shadowInset},0 0 26px {tint.shadowOuter};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;animation:bIn .9s ease-out .58s both"
      >
        <div
          style="white-space:nowrap;font-size:clamp(8px,1.9cqw,13px);letter-spacing:.2em;color:{tint.labelColor}"
        >
          {boot.coreLabel}
        </div>
        <div
          data-testid="boot-pct"
          style="white-space:nowrap;font-size:clamp(15px,5cqw,30px);font-weight:700;line-height:1;color:{tint.pctColor};font-variant-numeric:tabular-nums"
        >
          {pctText}
        </div>
        <div
          data-testid="boot-phase"
          style="white-space:nowrap;font-size:clamp(8px,1.8cqw,12px);letter-spacing:.18em;color:{tint.phaseColor}"
        >
          {phaseText}
        </div>
      </div>

      <div
        style="position:absolute;inset:0;margin:auto;width:30%;height:30%;border-radius:50%;border:1px solid rgba(95,198,180,.4);animation:png 3.8s cubic-bezier(.2,.6,.4,1) infinite;pointer-events:none"
      ></div>
      <div
        style="position:absolute;inset:0;margin:auto;width:30%;height:30%;border-radius:50%;border:1px solid rgba(95,198,180,.4);animation:png 3.8s cubic-bezier(.2,.6,.4,1) 1.9s infinite;pointer-events:none"
      ></div>
    </div>

    <div
      style="position:absolute;left:30px;top:24px;background:rgba(9,13,18,.78);border:1px solid rgba(224,69,60,.22);border-radius:4px;padding:8px 12px;display:flex;flex-direction:column;gap:4px;animation:bIn .5s ease-out both"
    >
      <div style="font-size:12px;white-space:nowrap;color:rgba(224,69,60,.85)">
        {commandLine}<span
          style="display:inline-block;width:7px;height:13px;margin-left:5px;vertical-align:-2px;background:rgba(224,69,60,.85);animation:blk 1.1s steps(1) infinite"
        ></span>
      </div>
      <div style="font-size:12px;white-space:nowrap;color:rgba(196,216,232,.45)">
        {boot.handshake.label}<span
          data-testid="boot-handshake"
          style="display:inline-block;min-width:126px">{handshake}</span
        >
      </div>
    </div>

    <div
      style="position:absolute;left:0;right:0;bottom:0;height:142px;box-sizing:border-box;display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:0 30px 16px"
    >
      <pre
        data-testid="boot-status-box"
        style="flex:none;margin:0;font:12px/1.5 inherit;color:rgba(224,69,60,.6);background:rgba(9,13,18,.78);border:1px solid rgba(224,69,60,.22);border-radius:4px;padding:8px 12px;animation:bIn .6s ease-out .2s both">{statusBoxText}</pre>

      {#if boot.showBootLog}
        <div
          style="flex:none;width:min(430px,34vw);height:126px;box-sizing:border-box;background:rgba(9,13,18,.78);border:1px solid rgba(224,69,60,.22);border-radius:4px;padding:8px 12px;display:flex;flex-direction:column;gap:3px;font-size:12px;animation:bIn .6s ease-out .3s both"
        >
          <div style="flex:none;color:rgba(224,69,60,.75);letter-spacing:.1em">
            {boot.bootLogTitle}
          </div>
          <div
            data-testid="boot-log"
            style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:3px"
          >
            {#each rows as row, i (i)}
              <div
                data-testid="boot-log-row"
                style="display:flex;align-items:baseline;gap:7px;white-space:nowrap"
              >
                <span style="flex:none;font-weight:700;color:{row.tagColor}">{row.tag}</span>
                <span style="color:rgba(196,216,232,.72)">{row.label}</span>
                <span
                  style="flex:1;min-width:12px;border-bottom:1px dotted rgba(196,216,232,.22);transform:translateY(-3px)"
                ></span>
                <span style="flex:none;color:{row.valColor}">{row.val}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    {#if outroing}
      <div
        data-testid="boot-outro"
        style="position:absolute;inset:0;z-index:40;pointer-events:none;background:radial-gradient(circle at 50% 50%,rgba(95,198,180,.22),rgba(11,15,20,.72) 44%,#0b0f14 78%);animation:bBloom .9s cubic-bezier(.3,.1,.2,1) both"
      ></div>
    {/if}
  </div>
{/if}
