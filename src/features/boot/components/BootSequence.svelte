<script lang="ts">
  // E.D.I.T.H boot sequence overlay. Source of truth:
  // /Users/shev/Desktop/waiting-on-form-answers/project/
  // "Boot Sequence.dc.html", the `booting`/`outroing` sc-if blocks (lines
  // 167-276) and the `Component` class (lines 283-442) — every color,
  // geometry value, keyframe name/duration/delay, and text string below is
  // transcribed from that file; timing/progress/log MATH is factored out to
  // src/features/boot/lib/boot.ts (kept pure so
  // src/features/boot/tests/unit/boot.test.ts can spot-check
  // the formulas without a browser), and every piece of on-screen TEXT
  // comes from the `BootData` built from src/features/boot/content/boot.yaml's timing/tag
  // config plus the boot log's text in src/features/boot/content/log.md — this file
  // renders geometry + data, never hardcodes copy.
  //
  // Always mounted by Terminal.svelte (same convention as GrepOverlay/
  // CopyMode: a `bind:this` ref with an imperative contract — here
  // `replay()`/`isActive()` — rather than a prop-driven open/close), so it
  // can own its own phase state machine across the app's lifetime and so
  // Terminal can gate ALL key handling on `isActive()` at the very top of
  // its own handleKey(), ahead of even the copy-mode overlay: boot is
  // "unskippable... swallows nothing" (mock's own componentDidMount
  // comment) — there is no key or click that reaches the site underneath
  // while it's running. Clicks need no separate guard: while `booting` is
  // true this component renders a `position:fixed;inset:0` OPAQUE layer
  // above everything else (z-index 100 — higher than GrepOverlay's 40 and
  // CopyMode's 50, since unlike those two boot deliberately covers the
  // status bar too: there IS no session chrome yet, boot IS the session
  // coming up), so pointer events on the dashboard/status-bar beneath
  // simply never arrive; z-index 100 is a documented deviation from the
  // mock's own z-index:30, which never had to coexist with this app's
  // other overlay layers.
  //
  // Session-once behavior (see src/features/boot/lib/boot-state.ts): a genuine
  // (non-skipped) boot marks the sessionStorage flag the moment it STARTS,
  // not when it finishes, so
  // reloading mid-boot can't be used to replay the full sequence
  // indefinitely. The initial `phase` is decided by reading that flag
  // directly inside the `$state()` initializer (not in a mount effect):
  // Svelte re-runs a component's setup script on the client during
  // hydration, so this reads the *real* sessionStorage value at that point
  // even though the SSR pass (no `sessionStorage` in Astro's Node
  // renderer) always defaults to "boot" — the server always emits the
  // boot markup as the very first paint, and a skip-path client corrects
  // it to "ready" as soon as its own script runs, which is what makes a
  // same-tab reload of a deep link resolve before Playwright's own
  // `waitUntil:"load"` navigation settles (verified in tests/e2e/boot.spec
  // .ts). A real, un-faked browser sees at most one raw-HTML-to-hydrated
  // frame of the boot overlay on a skip; "skips it" is judged functionally
  // (no 4.6s wait, no timers run), not frame-perfectly.
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
    /** Fired once, the moment a real (non-skipped) boot hands off to the
     * ready dashboard — Terminal.svelte uses it to play the `bDashIn`
     * entrance animation on the site chrome underneath. Never fired on the
     * skip path (there was no boot to hand off from). */
    onReady?: () => void;
  }

  const { boot, desktopMode, onReady }: Props = $props();

  type Phase = "boot" | "out" | "ready";

  // Deliberate one-time read, see the header comment: this must run fresh
  // on every mount (including a client hydration pass, which re-executes
  // this initializer) to see the real sessionStorage value, not react to
  // it changing afterward.
  let phase = $state<Phase>(hasBootPlayed() ? "ready" : "boot");
  // Rendered as `data-elapsed` below (a plain number, not user-visible
  // copy — same category as every other `data-testid`/`data-*` hook in
  // this codebase). tests/e2e/boot.spec.ts reads it back to derive its
  // pct/phase expectations from whatever elapsed value the component
  // ACTUALLY landed on, rather than the ms it asked a fake clock to
  // advance by — Playwright's clock resumes ticking in real time after
  // any control call (empirically confirmed, see that spec's own
  // comment), so the exact elapsed value at read-time isn't otherwise
  // knowable to millisecond precision from outside the page.
  let elapsed = $state(0);

  // Testability marker only (never read by any rendering logic): the
  // `{#if booting}` DOM mounts synchronously with `phase`'s initial value,
  // strictly BEFORE the `$effect` below has had a chance to call `run()`
  // (Svelte flushes effects after the render they were scheduled from) —
  // so under a Playwright fake clock, a test that waits only for the
  // overlay to be visible and then immediately calls `clock.runFor()` can
  // race ahead of `run()` actually capturing `t0`, making the advance a
  // no-op from the timer's perspective. `data-boot-running` flips true
  // synchronously inside `run()` itself, giving tests (tests/e2e/boot.spec
  // .ts) a deterministic point to wait for first.
  let running = $state(false);

  let t0 = 0;
  let tick: ReturnType<typeof setInterval> | undefined;
  let hardStop: ReturnType<typeof setTimeout> | undefined;
  let outTimer: ReturnType<typeof setTimeout> | undefined;

  // Component.finish()'s outro hold (line 358) before flipping to "ready".
  const OUT_MS = 760;

  function dur(): number {
    return bootDuration(boot.bootMs);
  }

  // Component.run() (line 338-351): wall-clock Date.now() + a 33ms
  // setInterval, NOT requestAnimationFrame — the mock's own comment (kept
  // verbatim in spirit): rAF pauses in a backgrounded tab, which would
  // otherwise leave the boot frozen mid-sequence for anyone who switches
  // away and back; the hard-stop timeout guarantees hand-off regardless.
  // This also makes the sequence controllable by Playwright's fake clock
  // (`page.clock`), which fires real setInterval/setTimeout callbacks
  // against virtual time but does not drive rAF at all.
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

  /** `r` on the ready dashboard, or the status-bar "reboot" control (via
   * Terminal.svelte) — always plays a full boot regardless of the
   * sessionStorage flag (already set from the first run; replay is a
   * manual, repeatable action, not a second "first load"). */
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

  // Gated to desktopMode like every other timer/listener in the app
  // (Terminal.svelte's own keydown/popstate effect, StatusBar's clock).
  // `untrack` on the `phase` read is load-bearing: finish()/replay()
  // mutate `phase` from OUTSIDE this effect
  // (an interval callback, an exported method) — if this effect's body
  // read `phase` as a tracked dependency, the write it triggers on
  // transition to "out" would re-run the effect, whose cleanup closure
  // reads the OUTER `let outTimer` at cleanup-call time (not at
  // effect-creation time) and would clear the timer finish() had *just*
  // created, before it ever fires — silently killing the hand-off to
  // "ready". Reading `phase` untracked keeps this effect's dependency list
  // to `desktopMode` alone, so it only (re)runs on mount or a genuine
  // desktop-mode flip.
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
    [boot.statusBox.top, ...boot.statusBox.rows.map(statusRowText), boot.statusBox.bottom].join("\n"),
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

      <div style="position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(224,69,60,.1)"></div>
      <div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:rgba(224,69,60,.1)"></div>

      <div style="position:absolute;left:50%;top:-2px;transform:translate(-50%,-100%);font-size:9px;color:rgba(224,69,60,.7)">
        {boot.compass.top}
      </div>
      <div style="position:absolute;left:50%;bottom:-2px;transform:translate(-50%,100%);font-size:9px;color:rgba(224,69,60,.7)">
        {boot.compass.bottom}
      </div>
      <div style="position:absolute;top:50%;left:-4px;transform:translate(-100%,-50%);font-size:9px;color:rgba(224,69,60,.5)">
        {boot.compass.left}
      </div>
      <div style="position:absolute;top:50%;right:-4px;transform:translate(100%,-50%);font-size:9px;color:rgba(224,69,60,.5)">
        {boot.compass.right}
      </div>
      <div style="position:absolute;left:52%;top:3%;font-size:9px;letter-spacing:.16em;color:rgba(196,216,232,.32)">
        {boot.compass.degrees[0]}
      </div>
      <div style="position:absolute;right:2%;top:51%;font-size:9px;letter-spacing:.16em;color:rgba(196,216,232,.32)">
        {boot.compass.degrees[1]}
      </div>
      <div style="position:absolute;left:52%;bottom:2%;font-size:9px;letter-spacing:.16em;color:rgba(196,216,232,.32)">
        {boot.compass.degrees[2]}
      </div>
      <div style="position:absolute;left:2%;top:51%;font-size:9px;letter-spacing:.16em;color:rgba(196,216,232,.32)">
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
        <div style="white-space:nowrap;font-size:clamp(8px,1.9cqw,13px);letter-spacing:.2em;color:{tint.labelColor}">
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
        {boot.handshake.label}<span data-testid="boot-handshake" style="display:inline-block;min-width:126px">{handshake}</span>
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
          <div style="flex:none;color:rgba(224,69,60,.75);letter-spacing:.1em">{boot.bootLogTitle}</div>
          <div
            data-testid="boot-log"
            style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:3px"
          >
            {#each rows as row, i (i)}
              <div data-testid="boot-log-row" style="display:flex;align-items:baseline;gap:7px;white-space:nowrap">
                <span style="flex:none;font-weight:700;color:{row.tagColor}">{row.tag}</span>
                <span style="color:rgba(196,216,232,.72)">{row.label}</span>
                <span style="flex:1;min-width:12px;border-bottom:1px dotted rgba(196,216,232,.22);transform:translateY(-3px)"
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
