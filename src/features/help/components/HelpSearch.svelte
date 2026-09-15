<script lang="ts">
  import type { CmdlineData, HelpData, HelpSearchData, ShellData } from "../../../common/lib/data";
  import {
    buildEntries,
    commandEntries,
    searchHelp,
    type HelpSearchEntry,
  } from "../lib/help-search";
  import { pushPasteTarget, removePasteTarget } from "../../../common/lib/paste-targets";
  import { STATUS_BAR_HEIGHT_PX } from "../../../common/lib/layout";

  interface Props {
    helpSearch: HelpSearchData;
    cmdline: CmdlineData;
    help: HelpData;
    /** shell.yaml — only its own `help.rows[]` is consulted here (see
     * help-search.ts's `shellEntries`); the rest of ShellData is irrelevant
     * to this palette. */
    shell: ShellData;
    /** Runs a resolved command entry's `action` id through Terminal.svelte's
     * own executeSiteAction; never called for a keymap entry, which no-ops
     * on Enter instead. */
    onExecute: (action: string | undefined) => void;
  }

  const { helpSearch, cmdline, help, shell, onExecute }: Props = $props();

  let open = $state(false);
  let text = $state("");
  /** Reset to 0 on every fresh result list, since this box (unlike
   * Cmdline's resting `-1`) has no typed command to fall back on — Enter
   * always means "the highlighted row". */
  let selected = $state(0);
  /** Brief "that did nothing" acknowledgment for Enter on a keymap row,
   * reset by its own timer rather than by any keydown. */
  let flash = $state(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  // Adapts HelpView.svelte's {name, desc, keys[]} row shape into
  // help-search.ts's {key, description} shape, rather than changing that
  // pure module (and its unit tests) to match a UI-specific shape.
  const searchSections = $derived(
    help.scopes.map((s) => ({
      title: s.label,
      rows: s.rows.map((r) => ({ key: r.name, description: r.desc })),
    })),
  );

  const commandList = $derived(commandEntries(cmdline.commands));
  const allEntries = $derived(buildEntries(cmdline.commands, searchSections, shell.help.rows));
  const results = $derived.by((): HelpSearchEntry[] =>
    text.trim() ? searchHelp(text, allEntries, cmdline.commands) : commandList,
  );
  const clampedSelected = $derived(Math.max(0, Math.min(selected, results.length - 1)));

  function resetState() {
    text = "";
    selected = 0;
    flash = false;
    clearTimeout(flashTimer);
  }

  /** Terminal.svelte's delegation gate — while true, this component's
   * handleKey() below consumes every key, and the tmux prefix system
   * treats it exactly like an open Cmdline box (only the bare Ctrl-b arm
   * and a prefixed `]` paste are allowed through). */
  export function isOpen(): boolean {
    return open;
  }

  export function openPalette(): void {
    resetState();
    open = true;
  }

  export function close(): void {
    open = false;
    resetState();
  }

  const PASTE_TARGET_ID = "help-search";

  /** Ctrl-b ] paste-target registration — active only while this box is
   * open, same stack-registry pattern as Cmdline/GrepOverlay. */
  $effect(() => {
    if (!open) return;
    pushPasteTarget({
      id: PASTE_TARGET_ID,
      insert: (t: string) => {
        text += t;
        selected = 0;
      },
    });
    return () => removePasteTarget(PASTE_TARGET_ID);
  });

  function triggerFlash() {
    flash = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash = false;
    }, 160);
  }

  function activate(entry: HelpSearchEntry | undefined) {
    if (!entry) return;
    if (entry.kind === "command") {
      onExecute(entry.action);
      close();
      return;
    }
    // Keymap row — informational only, so Enter just flashes the border.
    triggerFlash();
  }

  /** Returns `false` only when the box is closed; every key is consumed
   * while open, including unrecognized modifiers (never preventDefault-ed,
   * so OS shortcuts still fire). */
  export function handleKey(e: KeyboardEvent): boolean {
    if (!open) return false;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return true;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return true;

    if (e.key === "Enter") {
      e.preventDefault();
      activate(results[clampedSelected]);
      return true;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length > 0) selected = (clampedSelected + 1) % results.length;
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length > 0) selected = (clampedSelected - 1 + results.length) % results.length;
      return true;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      text = text.slice(0, -1);
      selected = 0;
      return true;
    }
    // Every printable character types, deliberately including q/j/k/? —
    // this is a text input, not a toggle key, so a second `?` while already
    // open just types instead of re-opening.
    if (e.key.length === 1) {
      e.preventDefault();
      text += e.key;
      selected = 0;
      return true;
    }
    return true;
  }
</script>

{#if open}
  <!-- Same session-chrome rule as Cmdline.svelte: `bottom` stops at the
       status bar's own height so the backdrop never dims/covers it. -->
  <div
    data-testid="help-search-overlay"
    style="position:fixed;left:0;top:0;right:0;bottom:{STATUS_BAR_HEIGHT_PX}px;z-index:60;background:rgba(6,9,13,.45);backdrop-filter:blur(2px);display:flex;flex-direction:column;align-items:center;padding-top:9vh"
  >
    <div style="width:min(680px,92vw);font-size:13px;line-height:1.55">
      <div
        style={`position:relative;border:1px solid rgba(224,69,60,${flash ? 1 : 0.55});border-radius:4px;background:rgba(9,13,18,.94);padding:11px 12px 8px;box-shadow:0 24px 80px rgba(0,0,0,.5);transition:border-color .12s`}
      >
        <div
          style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#0a0e13;padding:0 10px;color:#e0453c;letter-spacing:.14em;white-space:nowrap"
        >
          {helpSearch.title}
        </div>
        <div
          style="display:flex;align-items:baseline;gap:8px;padding:2px 4px 8px;border-bottom:1px solid rgba(224,69,60,.28)"
        >
          <span style="color:#5fc6b4">{helpSearch.prompt.glyph}</span>
          <span
            data-testid="help-search-input"
            style="flex:1;min-width:0;color:#f4ece9;white-space:pre;overflow:hidden"
            >{text}<span style="animation:blk 1.05s steps(1) infinite;color:#e0453c"
              >{helpSearch.prompt.cursorGlyph}</span
            ></span
          >
        </div>
        <div
          data-testid="help-search-mode"
          style="padding:4px 4px 2px;color:rgba(196,216,232,.42);font-size:12px"
        >
          {text.trim() ? "" : helpSearch.emptyHint}
        </div>
        <div
          data-testid="help-search-results"
          style="padding-top:2px;display:flex;flex-direction:column;gap:1px;max-height:320px;overflow-y:auto"
        >
          {#each results as r, i (r.id)}
            <div
              role="button"
              tabindex="0"
              data-testid="help-search-result"
              data-kind={r.kind}
              data-label={r.label}
              data-selected={i === clampedSelected}
              onclick={() => activate(r)}
              onkeydown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") activate(r);
              }}
              style={`cursor:pointer;display:flex;gap:10px;padding:3px 6px;border-radius:2px;` +
                (i === clampedSelected
                  ? "background:rgba(224,69,60,.22);color:#f4ece9"
                  : "color:rgba(196,216,232,.7)")}
            >
              <span
                style="flex:none;width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#5fc6b4"
                >{r.kind === "command" && r.takesArgs
                  ? `${r.label}${cmdline.argsPlaceholder}`
                  : r.label}</span
              >
              <span
                style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(196,216,232,.5)"
                >{r.description}</span
              >
              {#if r.kind === "keymap"}
                <span style="flex:none;color:rgba(196,216,232,.32);font-style:italic"
                  >{helpSearch.keymapHint}</span
                >
              {/if}
            </div>
          {:else}
            <div data-testid="help-search-empty" style="padding:6px;color:rgba(196,216,232,.45)">
              {helpSearch.noResultsText}
            </div>
          {/each}
        </div>
        <div
          style="padding:4px 4px 0;border-top:1px solid rgba(224,69,60,.18);color:rgba(196,216,232,.38);font-size:11px"
        >
          {helpSearch.footer.hint}
        </div>
      </div>
    </div>
  </div>
{/if}
