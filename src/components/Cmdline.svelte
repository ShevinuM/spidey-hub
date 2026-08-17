<script lang="ts">
  // Site-wide floating Cmdline (PLAN.md Phase 5C) — a noice.nvim-style
  // centered box, same visual family as GrepOverlay.svelte (bordered box,
  // box-drawing inset title, existing palette, prompt + blinking block
  // cursor). Always mounted (Terminal.svelte renders this once,
  // unconditionally), exactly like GrepOverlay/CopyMode/BootSequence —
  // Terminal owns a live `bind:this` ref so it can decide WHEN to open this
  // (three different entry contexts, see openSite/openEx/openTmux below)
  // and call handleKey() on every keydown once it's up.
  //
  // Three entry contexts share this one component (PLAN.md 5C.1), tracked
  // by `mode`:
  //   "site" — `:` from anywhere with no other text input active. Only
  //            `cmdline.commands` are offered/executed.
  //   "ex"   — `:` while a Builds/Personnel file editor is open. Terminal
  //            tries the LIFTED Phase-3 ex-command state machine first
  //            (src/lib/cmdline.ts's parseExCommand, executed by
  //            Editor.svelte's own runExCommand) via the `onSubmit` prop;
  //            only a command that machine doesn't recognize falls through
  //            to the site-wide set — "editor context wins" (PLAN.md 5C.2).
  //            The suggestion list here is exCommands ∪ commands, exCommands
  //            winning name collisions (src/lib/cmdline.ts's
  //            mergeCommandLists).
  //   "tmux" — `Ctrl-b :`, real tmux's own "command-prompt" binding. Only
  //            `cmdline.tmuxCommands` are offered/executed.
  //
  // This component itself is deliberately dumb about EXECUTION: `onSubmit`
  // is the only way anything actually happens (view switches, grep/reboot/
  // resume, window rename/kill/select) — Terminal.svelte owns every one of
  // those side effects, exactly like GrepOverlay's `onNavigate` prop. This
  // component only owns: open/closed + which mode, the typed text, the
  // live suggestion list (src/lib/cmdline.ts's pure filter/complete), and
  // rendering the transient error `onSubmit` hands back.
  import type { CmdlineData, CmdlineCommandDef } from "../lib/data";
  import { completeInput, filterSuggestions, mergeCommandLists, parseInput, type CommandDef } from "../lib/cmdline";
  import { pushPasteTarget, removePasteTarget } from "../lib/pasteTargets";
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
  /** -1 = nothing highlighted (the resting state — Enter still parses
   * whatever's actually typed, never an implicit "first suggestion"). */
  let selected = $state(-1);

  const commandSource = $derived.by((): CommandDef[] => {
    if (mode === "tmux") return cmdline.tmuxCommands;
    if (mode === "ex") return mergeCommandLists(cmdline.exCommands, cmdline.commands);
    return cmdline.commands;
  });

  const parsed = $derived(parseInput(text));
  const suggestions = $derived(filterSuggestions(commandSource, parsed.name));

  function resetState() {
    text = "";
    error = null;
    selected = -1;
  }

  /** Terminal.svelte's delegation gate (PLAN.md 5C.4): while true, this
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

  /** Ctrl-b ] paste-target registration (PLAN.md 5C.1(c) / Phase 5 item
   * 5.3's paste-target registry) — active only while this box is open. */
  $effect(() => {
    if (!open) return;
    pushPasteTarget({
      id: PASTE_TARGET_ID,
      insert: (t: string) => {
        text += t;
        error = null;
        selected = -1;
      },
    });
    return () => removePasteTarget(PASTE_TARGET_ID);
  });

  function submit() {
    const result = onSubmit(mode, text);
    if (result) {
      error = result;
      selected = -1;
    } else {
      close();
    }
  }

  function selectSuggestion(i: number) {
    selected = i;
    const s = suggestions[i];
    if (s) text = s.name;
    error = null;
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
    // (PLAN.md 5C.2 "cleared by Esc/next open" — a fresh keystroke is
    // "next open" in spirit: the box stays open, but the stale message
    // must not linger over new input).
    if (error) error = null;

    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return true;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const completed = completeInput(commandSource, text);
      if (completed) text = completed;
      return true;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length > 0) selectSuggestion(selected < 0 ? 0 : (selected + 1) % suggestions.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length > 0)
        selectSuggestion(selected < 0 ? suggestions.length - 1 : (selected - 1 + suggestions.length) % suggestions.length);
      return true;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      text = text.slice(0, -1);
      selected = -1;
      return true;
    }
    // j/k stay typeable (PLAN.md 5C.3 "j/k do NOT navigate suggestions —
    // arrows do") — they fall straight into this generic printable-char
    // branch like every other letter.
    if (e.key.length === 1) {
      e.preventDefault();
      text += e.key;
      selected = -1;
      return true;
    }
    return true;
  }

  function describe(c: CmdlineCommandDef): string {
    return c.takesArgs ? `${c.name} <…>` : c.name;
  }
</script>

{#if open}
  <!-- Session-chrome rule (PLAN.md Phase 5 item 5.5, extended by 5C.4):
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
        {:else if suggestions.length > 0}
          <div
            data-testid="cmdline-suggestions"
            style="padding-top:4px;display:flex;flex-direction:column;gap:1px;max-height:220px;overflow-y:auto"
          >
            {#each suggestions as s, i (s.name)}
              <div
                role="button"
                tabindex="0"
                data-testid="cmdline-suggestion"
                data-name={s.name}
                data-selected={i === selected}
                onclick={() => selectSuggestion(i)}
                onkeydown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") selectSuggestion(i);
                }}
                style={`cursor:pointer;display:flex;gap:10px;padding:2px 6px;border-radius:2px;` +
                  (i === selected ? "background:rgba(224,69,60,.22);color:#f4ece9" : "color:rgba(196,216,232,.7)")}
              >
                <span style="flex:none;color:#5fc6b4">{describe(s)}</span>
                <span
                  style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(196,216,232,.5)"
                  >{s.description}</span
                >
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
