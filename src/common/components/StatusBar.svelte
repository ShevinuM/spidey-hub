<script lang="ts">
  // tmux-style status bar (reference/Homepage.dc.html lines 443-461).
  //
  // The window list is replaced, one state at a time, by a transient
  // auto-clearing message, an editable rename prompt, or a y/n kill
  // confirm — driven by the exported `showMessage`/`startRename`/
  // `startConfirm` methods.
  //
  // Only the rename/confirm states own the keyboard (Terminal.svelte calls
  // this component's `handleKey()` before any other view ref while one is
  // active); a bare message does not, so `handleKey()` returns `false` for
  // it.
  import type { SiteData, WindowEntry } from "../lib/data";
  import { formatClockDate, formatClockTime, msUntilNextMinute } from "../lib/clock";
  import { pushPasteTarget, removePasteTarget } from "../lib/paste-targets";
  import { STATUS_BAR_HEIGHT_PX } from "../lib/layout";

  interface Props {
    site: SiteData;
    /** The attached session's own bare name, substituted into
     * `site.statusBar.sessionTemplate` here rather than passed
     * pre-formatted — this component owns all of its own text rendering. */
    sessionName: string;
    windows: WindowEntry[];
    /** The tmux model's own active window id, passed straight through
     * rather than derived from a `view`/ViewId.
     *
     * A window's id and the program its pane currently runs are not the
     * same thing — any pane can run any program in any window — so this
     * must be told directly. */
    activeWindowId: string;
    /** Marks the previously active window (`Session.lastWindowIdx`) so
     * `Ctrl-b l` has something to jump back to; undefined until the
     * session has switched windows at least once. */
    lastWindowId?: string | undefined;
    /** The clicked window's own `id` (e.g. "repositories") — this
     * component does no id/ViewId translation; the caller owns that. */
    onSelect: (windowId: string) => void;
    /** ↻ reboot — always rendered in the right-hand cluster regardless of
     * prompt state; Terminal.svelte's handler cancels any open prompt
     * before switching and replaying. */
    onReboot: () => void;
  }

  const { site, sessionName, windows, activeWindowId, lastWindowId, onSelect, onReboot }: Props =
    $props();

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
  // Status-line prompt state machine
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

  /** Transient, auto-clearing status-line message (e.g. "nothing to
   * paste", "last remaining window").
   *
   * Does NOT own the keyboard — see the file header. */
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
   * with no side effect.
   *
   * `text` is the full prompt line, already formatted from
   * `site.statusBar.prompts.killWindowTemplate`/`killPaneTemplate`. */
  export function startConfirm(text: string, onYes: () => void): void {
    clearTimeout(messageTimer);
    prompt = { kind: "confirm", text, onYes };
  }

  /** Terminal.svelte's delegation gate: while true, `handleKey()` below
   * consumes every key (rename/confirm keyboard ownership). */
  export function isPromptActive(): boolean {
    return prompt.kind === "rename" || prompt.kind === "confirm";
  }

  /** Cancels any open rename/confirm prompt.
   *
   * Terminal.svelte's reboot handler calls this first, since the ↻ control
   * stays clickable even while a prompt is open. */
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

    // confirm — an exact, case-sensitive `e.key === "y"` (unlike
    // choose-tree's confirm, which is case-insensitive); any other key
    // cancels rather than leaving the prompt stuck open.
    if (e.key === "y") {
      e.preventDefault();
      const onYes = prompt.onYes;
      prompt = { kind: "none" };
      onYes();
      return true;
    }
    e.preventDefault();
    prompt = { kind: "none" };
    return true;
  }
</script>

<div
  style="height:{STATUS_BAR_HEIGHT_PX}px;flex:none;display:flex;align-items:center;background:#0d2a2f;font-size:14px"
>
  <div
    data-testid="status-bar-session"
    style="flex:none;padding:0 8px;color:#7fd8a8;letter-spacing:.02em;white-space:nowrap"
  >
    {site.statusBar.sessionTemplate.replace("{name}", sessionName)}
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
          onclick={(e) => {
            onSelect(win.id);
            // Blurs immediately so this span doesn't stay focused and
            // intercept a later, unrelated Enter/Space keydown before it
            // reaches Terminal.svelte's window-level listener.
            (e.currentTarget as HTMLElement).blur();
          }}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              onSelect(win.id);
              (e.currentTarget as HTMLElement).blur();
            }
          }}
          style={win.id === activeWindowId
            ? "cursor:pointer;background:#e0453c;color:#0b0f14;padding:0 6px"
            : "cursor:pointer"}
        >
          {win.number}:{win.name}{win.id === activeWindowId
            ? "*"
            : win.id === lastWindowId
              ? "-"
              : ""}
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
      onclick={(e) => {
        onReboot();
        // See the status-bar-window span's own onclick comment above.
        (e.currentTarget as HTMLElement).blur();
      }}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onReboot();
          (e.currentTarget as HTMLElement).blur();
        }
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
