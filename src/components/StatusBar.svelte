<script lang="ts">
  // tmux-style status bar (design/Homepage.dc.html lines 443-461).
  //
  // Bug fix 1: the prototype appends the active Retina-V window *after*
  // profile ("...4:profile 3:retina-v*") instead of rendering it in place.
  // We always render windows 0-5 in numeric order (as authored in
  // site.yaml) and simply highlight whichever one is active, in place.
  //
  // Bug fix 2: the prototype hardcodes "23:34" / "15-Aug-26". We render a
  // live local clock, filled immediately on mount and refreshed on a
  // minute-aligned timer, gated by the same desktop/fine-pointer guard as
  // every other listener/timer in the app (README "Mobile policy").
  //
  // PLAN.md Phase 1 item 1.3: every window is mouse-clickable (`onSelect`,
  // provided by Terminal.svelte as `setView` composed with
  // `windowIdToView()` for the one id — "dashboard" — that doesn't already
  // equal its own ViewId), not just the dashboard menu / tmux prefix.
  //
  // PLAN.md Phase 5 item 5.1: this component also owns the tmux-style
  // status-LINE prompt states — a transient auto-clearing message, an
  // editable text prompt (`(rename-window) <name>`), and a y/n confirm
  // (`kill-window <name>? (y/n)`) — which REPLACE the normal window-list
  // rendering while active (exactly like real tmux's status line). Terminal
  // .svelte drives all three through the exported `showMessage`/
  // `startRename`/`startConfirm` methods below (the window list itself is
  // now a live, mutable prop — `windows` — rather than read straight off
  // `site.statusBar.windows`, so Ctrl-b , 's rename actually sticks and
  // Ctrl-b & 's kill actually removes a row). While a prompt/confirm is
  // active it OWNS the keyboard: Terminal calls this component's
  // `handleKey()` before anything else (prefix arm, grep, every view ref),
  // exactly like GrepOverlay's own "every key is ours while open" contract
  // — typing "j" into a rename must not scroll a list behind it. A bare
  // `message` state does NOT own the keyboard (it's purely informational and
  // auto-clears on its own), so `handleKey()` returns `false` for it.
  import type { SiteData, WindowEntry } from "../lib/data";
  import { formatClockDate, formatClockTime, msUntilNextMinute } from "../lib/clock";
  import { pushPasteTarget, removePasteTarget } from "../lib/pasteTargets";
  import { STATUS_BAR_HEIGHT_PX } from "../lib/layout";

  interface Props {
    site: SiteData;
    windows: WindowEntry[];
    /** PLAN.md Iteration 3 Phase 4 item 4.1: the tmux model's own active
     * window id, passed straight through rather than derived here from a
     * `view`/ViewId — a window's id and the PROGRAM its pane currently runs
     * are no longer the same thing once a pane can run any program (or a
     * shell) in any window (Locked decision #5), so this component must be
     * told directly which window is active rather than reconstructing it
     * from the visible program. */
    activeWindowId: string;
    /** PLAN.md Iteration 3 Phase 4 item 4.3 tmux fidelity reference: the
     * real tmux `-` flag marks the PREVIOUSLY active window of the session
     * (`Session.lastWindowIdx` in tmux.ts), so `Ctrl-b l`/`last-window`
     * has something to jump back to. Undefined whenever the session hasn't
     * switched windows yet (fresh session: last === active, no flag). */
    lastWindowId?: string;
    /** Passed the clicked window's own `id` (a site.yaml window id, e.g.
     * "builds") — no ViewId translation happens in this component; the
     * caller (Terminal.svelte) owns turning a window id into a window
     * switch. */
    onSelect: (windowId: string) => void;
    /** ↻ reboot (PLAN.md Phase 5B item 5B.3) — always rendered in the
     * right-hand cluster (unlike the window list, which the rename/confirm
     * prompt states below replace), so it must stay clickable regardless
     * of prompt state; Terminal.svelte's handler cancels any open prompt
     * itself before switching + replaying. */
    onReboot: () => void;
  }

  const { site, windows, activeWindowId, lastWindowId, onSelect, onReboot }: Props = $props();

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

  // ---------------------------------------------------------------------
  // Status-line prompt state machine (PLAN.md Phase 5 item 5.1)
  // ---------------------------------------------------------------------

  const MESSAGE_MS = 2600;
  const PASTE_TARGET_ID = "status-rename";

  type PromptState =
    | { kind: "none" }
    | { kind: "message"; text: string }
    | { kind: "rename"; text: string; onCommit: (name: string) => void }
    | { kind: "confirm"; text: string; onYes: () => void };

  let prompt = $state<PromptState>({ kind: "none" });
  let messageTimer: ReturnType<typeof setTimeout> | undefined;

  /** Transient, auto-clearing status-line message (Ctrl-b ] with nothing to
   * paste, Ctrl-b & on the last remaining window). Does NOT own the
   * keyboard — see file header comment. */
  export function showMessage(text: string): void {
    prompt = { kind: "message", text };
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      if (prompt.kind === "message") prompt = { kind: "none" };
    }, MESSAGE_MS);
  }

  /** Ctrl-b , — status bar swaps to an editable prompt prefilled with
   * `initial` (the active window's current name); Enter commits via
   * `onCommit`, Esc cancels with no side effect. */
  export function startRename(initial: string, onCommit: (name: string) => void): void {
    clearTimeout(messageTimer);
    prompt = { kind: "rename", text: initial, onCommit };
  }

  /** Ctrl-b & / Ctrl-b x — `y` runs `onYes`, `n`/anything-not-y/Esc cancels
   * with no side effect. `text` is the full prompt line, already formatted
   * from `site.statusBar.prompts.killWindowTemplate`/`killPaneTemplate`. */
  export function startConfirm(text: string, onYes: () => void): void {
    clearTimeout(messageTimer);
    prompt = { kind: "confirm", text, onYes };
  }

  /** Terminal.svelte's delegation gate: while true, `handleKey()` below
   * consumes every key (rename/confirm keyboard ownership). */
  export function isPromptActive(): boolean {
    return prompt.kind === "rename" || prompt.kind === "confirm";
  }

  /** PLAN.md Phase 5B hazard note: "reboot from a view with a prompt open
   * should cancel the prompt" — the ↻ reboot control (right cluster) is
   * always rendered, even while a rename/kill-window/kill-pane prompt has
   * replaced the window list on the left, so Terminal.svelte's reboot
   * handler calls this first. A no-op for the "message"/"none" states
   * (nothing to own/cancel there). */
  export function cancelPrompt(): void {
    clearTimeout(messageTimer);
    prompt = { kind: "none" };
  }

  function pasteIntoRename(text: string): void {
    if (prompt.kind === "rename") prompt = { ...prompt, text: prompt.text + text };
  }

  // Registers the rename prompt as the active `Ctrl-b ]` paste target only
  // while it's the one actually showing — pushed/popped by `id`, so closing
  // it hands paste-target control back to whatever was registered
  // underneath (e.g. a grep query left open beneath the prompt).
  $effect(() => {
    if (prompt.kind !== "rename") return;
    pushPasteTarget({ id: PASTE_TARGET_ID, insert: pasteIntoRename });
    return () => removePasteTarget(PASTE_TARGET_ID);
  });

  export function handleKey(e: KeyboardEvent): boolean {
    if (prompt.kind === "none" || prompt.kind === "message") return false;

    if (e.key === "Escape") {
      prompt = { kind: "none" };
      return true;
    }

    // Unrecognized modifier combos fall through untouched (consumed, never
    // preventDefault-ed) — same convention as GrepOverlay/Editor.
    if (e.metaKey || e.ctrlKey || e.altKey) return true;

    if (prompt.kind === "rename") {
      if (e.key === "Enter") {
        const name = prompt.text.trim();
        const onCommit = prompt.onCommit;
        prompt = { kind: "none" };
        // An empty commit is treated as a cancel (keep the old name) — a
        // stray Enter on a fully-backspaced prompt must never blank a
        // window's label.
        if (name) onCommit(name);
        return true;
      }
      if (e.key === "Backspace") {
        prompt = { ...prompt, text: prompt.text.slice(0, -1) };
        return true;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        prompt = { ...prompt, text: prompt.text + e.key };
        return true;
      }
      return true;
    }

    // confirm
    const k = e.key.toLowerCase();
    if (k === "y") {
      e.preventDefault();
      const onYes = prompt.onYes;
      prompt = { kind: "none" };
      onYes();
      return true;
    }
    if (k === "n") {
      e.preventDefault();
      prompt = { kind: "none" };
      return true;
    }
    return true;
  }
</script>

<div style="height:{STATUS_BAR_HEIGHT_PX}px;flex:none;display:flex;align-items:center;background:#0d2a2f;font-size:14px">
  <div style="flex:none;padding:0 8px;color:#7fd8a8;letter-spacing:.02em;white-space:nowrap">
    {site.statusBar.session}
  </div>
  <div style="color:rgba(127,216,200,.45)">{site.statusBar.separator}</div>

  {#if prompt.kind === "rename"}
    <div
      data-testid="status-prompt"
      style="display:flex;align-items:center;padding:0 8px;color:#f4ece9;white-space:pre;overflow:hidden;flex:1 1 auto;min-width:0"
    >
      <span style="color:#5fc6b4">{site.statusBar.prompts.renamePrefix}</span>{prompt.text}<span
        style="display:inline-block;width:7px;height:13px;margin-left:1px;vertical-align:-2px;background:#5fc6b4;animation:blk 1.1s steps(1) infinite"
      ></span>
    </div>
  {:else if prompt.kind === "confirm"}
    <div
      data-testid="status-confirm"
      style="display:flex;align-items:center;gap:8px;padding:0 8px;color:#f4ece9;white-space:nowrap"
    >
      {prompt.text}
    </div>
  {:else if prompt.kind === "message"}
    <div
      data-testid="status-message"
      style="display:flex;align-items:center;padding:0 8px;color:#e0453c;white-space:nowrap"
    >
      {prompt.text}
    </div>
  {:else}
    <div
      data-testid="status-bar-windows"
      style="display:flex;align-items:center;gap:8px;padding:0 8px;color:#5fc6b4;white-space:nowrap;flex:0 0 auto"
    >
      {#each windows as win (win.id)}
        <span
          role="button"
          tabindex="0"
          class="status-bar-window"
          data-testid="status-bar-window"
          data-window-id={win.id}
          onclick={() => onSelect(win.id)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelect(win.id);
          }}
          style={win.id === activeWindowId ? "cursor:pointer;background:#e0453c;color:#0b0f14;padding:0 6px" : "cursor:pointer"}
        >
          {win.number}:{win.name}{win.id === activeWindowId ? "*" : win.id === lastWindowId ? "-" : ""}
        </span>
      {/each}
    </div>
  {/if}
  <div style="flex:1"></div>
  <div style="flex:none;display:flex;gap:12px;padding:0 14px;white-space:nowrap">
    <span
      role="button"
      tabindex="0"
      data-testid="status-bar-reboot"
      onclick={onReboot}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") onReboot();
      }}
      style="cursor:pointer;color:rgba(217,176,74,.8)"
      class="status-bar-reboot"
    >
      {site.statusBar.rebootLabel}
    </span>
    <span style="color:rgba(95,198,180,.75)">{site.statusBar.grepHint}</span>
    <span data-testid="status-bar-clock-time" style="color:#d7a3e0">{clockTime}</span>
    <span data-testid="status-bar-clock-date" style="color:#c98fd0">{clockDate}</span>
  </div>
</div>

<style>
  .status-bar-window:hover {
    color: #8fd0f5;
  }
  .status-bar-reboot:hover {
    color: #e0453c;
  }
</style>
