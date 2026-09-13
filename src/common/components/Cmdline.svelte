<script lang="ts">
  // Site-wide floating Cmdline (noice.nvim-style centered box, same visual
  // family as GrepOverlay). Always mounted; Terminal.svelte owns a live
  // `bind:this` ref to pick when to open it and forwards every keydown to
  // `handleKey()`.
  //
  // Three entry contexts share this component via `mode`: "site" (`:` with
  // nothing else open — only `cmdline.commands`), "ex" (`:` with an editor
  // open — tries `cmdline.ts`'s `parseExCommand` first via `onSubmit`, and
  // only falls through to `cmdline.commands` on an unrecognized command;
  // Tab-completion candidates are `exCommands ∪ commands`, `exCommands`
  // winning name collisions via `mergeCommandLists`), and "tmux" (`Ctrl-b
  // :` — only `cmdline.tmuxCommands`).
  //
  // This component does no execution itself: `onSubmit` is the only side
  // effect, and completion is silent zsh-style Tab-cycling (`cmdline.ts`'s
  // `cycleComplete`) with no visible suggestion list — the `?` help
  // palette is the browsable surface instead.
  import type { CmdlineData } from "../lib/data";
  import { cycleComplete, mergeCommandLists, type CommandDef, type TabCycleState } from "../lib/cmdline";
  import { pushPasteTarget, removePasteTarget } from "../lib/paste-targets";
  import { STATUS_BAR_HEIGHT_PX } from "../lib/layout";

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
  /** Non-null only for the span of consecutive Tab presses cycling the same
   * match list; every other keydown resets it, so the next Tab always
   * starts a fresh cycle from what's currently typed. */
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

  /** Handles one keydown while the box is open; returns `false` only when
   * the box is closed, since every key is "ours" once open — same
   * always-consumed contract as GrepOverlay/StatusBar's prompt, including
   * unrecognized modifier combos (consumed, never preventDefault-ed). */
  export function handleKey(e: KeyboardEvent): boolean {
    if (!open) return false;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return true;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return true;

    // Any key after an error dismisses it without clearing the typed text.
    if (error) error = null;

    // Any key other than Tab invalidates the in-progress cycle, so the next
    // Tab press always starts fresh from whatever's typed at that moment.
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
    // j/k and other printable characters just type; ArrowUp/ArrowDown have
    // no suggestion list to navigate, so they fall through to "consumed, no
    // side effect" below.
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
