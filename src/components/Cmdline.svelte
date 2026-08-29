<script lang="ts">
  // Site-wide floating Cmdline — a noice.nvim-style
  // centered box, same visual family as GrepOverlay.svelte (bordered box,
  // box-drawing inset title, existing palette, prompt + blinking block
  // cursor). Always mounted (Terminal.svelte renders this once,
  // unconditionally), exactly like GrepOverlay/CopyMode/BootSequence —
  // Terminal owns a live `bind:this` ref so it can decide WHEN to open this
  // (three different entry contexts, see openSite/openEx/openTmux below)
  // and call handleKey() on every keydown once it's up.
  //
  // Three entry contexts share this one component, tracked
  // by `mode`:
  //   "site" — `:` from anywhere with no other text input active. Only
  //            `cmdline.commands` are offered/executed.
  //   "ex"   — `:` while a Repositories/Personnel file editor is open. Terminal
  //            tries the ex-command state machine first
  //            (src/common/lib/cmdline.ts's parseExCommand, executed by
  //            Editor.svelte's own runExCommand) via the `onSubmit` prop;
  //            only a command that machine doesn't recognize falls through
  //            to the site-wide set — "editor context wins".
  //            Tab-completion candidates here are exCommands ∪ commands,
  //            exCommands winning name collisions (src/common/lib/cmdline.ts's
  //            mergeCommandLists) — same "editor context wins" precedence.
  //   "tmux" — `Ctrl-b :`, real tmux's own "command-prompt" binding. Only
  //            `cmdline.tmuxCommands` are offered/executed.
  //
  // This component itself is deliberately dumb about EXECUTION: `onSubmit`
  // is the only way anything actually happens (view switches, grep/reboot/
  // resume, window rename/kill/select) — Terminal.svelte owns every one of
  // those side effects, exactly like GrepOverlay's `onNavigate` prop. This
  // component only owns: open/closed + which mode, the typed text, silent
  // zsh-style Tab-cycling (src/common/lib/cmdline.ts's pure cycleComplete —
  // deliberately no visible suggestions list under the input: the `?`
  // HelpSearch.svelte palette is the discoverable/browsable surface, this
  // box stays a plain, quiet command line), and rendering the transient
  // error `onSubmit` hands back.
  import type { CmdlineData } from "../common/lib/data";
  import { cycleComplete, mergeCommandLists, type CommandDef, type TabCycleState } from "../common/lib/cmdline";
  import { pushPasteTarget, removePasteTarget } from "../common/lib/paste-targets";
  import { STATUS_BAR_HEIGHT_PX } from "../common/lib/layout";

  export type CmdlineMode = "site" | "ex" | "tmux";

  interface Props {
    cmdline: CmdlineData;
    /** Returns an error string to display in the box (command recognized
     * but failed, or unrecognized -> E492), or `undefined` on success — a
     * successful submit always closes the box (Terminal.svelte has already
     * performed whatever side effect the command implies by the time this
     * returns). */
    onSubmit: (mode: CmdlineMode, raw: string) => string | undefined;
  }

  const { cmdline, onSubmit }: Props = $props();

  let open = $state(false);
  let mode = $state<CmdlineMode>("site");
  let text = $state("");
  let error = $state<string | null>(null);
  /** Tab-cycle state — non-null only
   * for the span of consecutive Tab presses that are cycling the SAME
   * match list; reset to `null` by every other keydown (Enter, Backspace,
   * a printable character, Escape, opening the box) so the next Tab press
   * always starts a fresh cycle from whatever's typed at that moment. */
  let cycle = $state<TabCycleState | null>(null);

  const commandSource = $derived.by((): CommandDef[] => {
    if (mode === "tmux") return cmdline.tmuxCommands;
    if (mode === "ex") return mergeCommandLists(cmdline.exCommands, cmdline.commands);
    return cmdline.commands;
  });

  function resetState() {
    text = "";
    error = null;
    cycle = null;
  }

  /** Terminal.svelte's delegation gate: while true, this
   * component's handleKey() below consumes every key, and the tmux prefix
   * system treats it exactly like an open status-bar prompt (only the bare
   * Ctrl-b arm and a prefixed `]` paste are allowed through). */
  export function isOpen(): boolean {
    return open;
  }

  export function openSite(): void {
    mode = "site";
    resetState();
    open = true;
  }

  export function openEx(): void {
    mode = "ex";
    resetState();
    open = true;
  }

  export function openTmux(): void {
    mode = "tmux";
    resetState();
    open = true;
  }

  export function close(): void {
    open = false;
    resetState();
  }

  const PASTE_TARGET_ID = "cmdline";

  /** Ctrl-b ] paste-target registration — active only while this box is
   * open. */
  $effect(() => {
    if (!open) return;
    pushPasteTarget({
      id: PASTE_TARGET_ID,
      insert: (t: string) => {
        text += t;
        error = null;
      },
    });
    return () => removePasteTarget(PASTE_TARGET_ID);
  });

  function submit() {
    const result = onSubmit(mode, text);
    if (result) {
      error = result;
    } else {
      close();
    }
  }

  /** Handles one keydown while the box is open. Returns `false` only when
   * the box is closed (letting Terminal.svelte's own handling decide
   * whether to open it) — every key is "ours" once open, same
   * always-consumed-while-open contract GrepOverlay/StatusBar's prompt
   * already use, including unrecognized modifier combos (consumed but
   * never preventDefault-ed, so browser/OS shortcuts still fire). */
  export function handleKey(e: KeyboardEvent): boolean {
    if (!open) return false;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return true;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return true;

    // Any key after an error dismisses it and keeps editing the same text
    // ("cleared by Esc/next open" — a fresh keystroke is "next open" in
    // spirit: the box stays open, but the stale message must not linger
    // over new input).
    if (error) error = null;

    // Tab-cycling — every key OTHER
    // than Tab invalidates whatever cycle is in progress, so the very next
    // Tab press always starts a FRESH one from whatever's typed at that
    // moment (a stray Enter that only surfaced an error, or a Backspace/
    // printable edit, must never leave a stale cycle position for a later,
    // unrelated Tab press to continue from). Reset happens once, here, at
    // the top — not duplicated in every branch below.
    if (e.key !== "Tab") cycle = null;

    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return true;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const result = cycleComplete(commandSource, text, cycle);
      if (result) {
        text = result.text;
        cycle = result.state;
      }
      return true;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      text = text.slice(0, -1);
      return true;
    }
    // j/k (and every other printable character) just type. ArrowUp/ArrowDown
    // have no suggestion list to navigate, so they simply fall through to
    // the generic "consumed, no side effect" return below.
    if (e.key.length === 1) {
      e.preventDefault();
      text += e.key;
      return true;
    }
    return true;
  }
</script>

{#if open}
  <!-- Session-chrome rule:
       `bottom` stops at the status bar's own height so the backdrop never
       dims/covers it, exactly like GrepOverlay/CopyMode's own backdrops.
       `align-items:flex-start` + top padding puts the box itself in the
       upper third of the remaining area (noice.nvim's own placement),
       distinguishing it from grep's vertically-centered overlay. -->
  <div
    data-testid="cmdline-overlay"
    style="position:fixed;left:0;top:0;right:0;bottom:{STATUS_BAR_HEIGHT_PX}px;z-index:60;background:rgba(6,9,13,.45);backdrop-filter:blur(2px);display:flex;flex-direction:column;align-items:center;padding-top:9vh"
  >
    <div style="width:min(640px,92vw);font-size:13px;line-height:1.55">
      <div
        style="position:relative;border:1px solid rgba(224,69,60,.55);border-radius:4px;background:rgba(9,13,18,.94);padding:11px 12px 8px;box-shadow:0 24px 80px rgba(0,0,0,.5)"
      >
        <div
          style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#0a0e13;padding:0 10px;color:#e0453c;letter-spacing:.14em;white-space:nowrap"
        >
          {cmdline.title}
        </div>
        <div
          style="display:flex;align-items:baseline;gap:8px;padding:2px 4px 8px;border-bottom:1px solid rgba(224,69,60,.28)"
        >
          <span style="color:#5fc6b4">{cmdline.prompt.glyph}</span>
          <span data-testid="cmdline-input" style="flex:1;min-width:0;color:#f4ece9;white-space:pre;overflow:hidden"
            >{text}<span style="animation:blk 1.05s steps(1) infinite;color:#e0453c">{cmdline.prompt.cursorGlyph}</span
            ></span
          >
        </div>
        {#if error}
          <div data-testid="cmdline-error" style="padding:6px 4px 2px;color:#e0453c">{error}</div>
        {/if}
      </div>
    </div>
  </div>
{/if}
