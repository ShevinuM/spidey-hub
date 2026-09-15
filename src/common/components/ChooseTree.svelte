<script lang="ts">
  // choose-tree overlay (`Ctrl-b w`) — a full window-content overlay (not a
  // centered box), mirroring real tmux's choose-tree replacing the entire
  // pane area while leaving the status line visible.
  //
  // Always mounted, same `bind:this`/`handleKey(): boolean`/`close()`/
  // `isOpen()` contract as GrepOverlay/CopyMode/Cmdline/HelpSearch.
  //
  // Terminal.svelte consults this component's `handleKey()` after copy-mode
  // and the tmux prefix system, but before Cmdline/StatusBar/every view
  // ref.
  //
  // While open: the prefix still arms/dispatches underneath it (so
  // `Ctrl-b d` and window-switch keys still work, and close this overlay
  // for free via `closeWindowChrome()`); Terminal's `handlePrefixedKey`
  // gates the four prefixed keys that would otherwise pop a competing modal
  // underneath this one (`,`/`&`/`x`/`:`), since this component's
  // `handleKey()` would swallow every key first and starve that modal;
  // every unprefixed key (j/k/h/l/Enter/x/q/Esc/?) reaches this component's
  // own `handleKey()` instead, which owns the keyboard for tree navigation
  // while open.
  import type { Client } from "../engines/tmux/tmux";
  import { allPanes } from "../engines/tmux/tmux";
  import type { ChooseTreeData } from "../lib/data";
  import { STATUS_BAR_HEIGHT_PX } from "../lib/layout";

  interface Props {
    client: Client;
    chooseTree: ChooseTreeData;
    /** Enter on a WINDOW row — switches to it (attaching its session first
     * if it isn't already the attached one) and closes the overlay. */
    onSelectWindow: (sessionId: string, windowId: string) => void;
    /** Enter on a SESSION row — attaches that session (real tmux: staying
     * on whichever window it already had active, no window change) and
     * closes the overlay. */
    onSelectSession: (sessionId: string) => void;
    onKillWindow: (sessionId: string, windowId: string) => void;
    onKillSession: (sessionId: string) => void;
  }

  const {
    client,
    chooseTree,
    onSelectWindow,
    onSelectSession,
    onKillWindow,
    onKillSession,
  }: Props = $props();

  let open = $state(false);
  let expandedSessionIds = $state<Set<string>>(new Set());
  let selectedIdx = $state(0);
  let killPrompt = $state<{
    kind: "window" | "session";
    sessionId: string;
    windowId?: string | undefined;
    text: string;
  } | null>(null);

  interface Row {
    kind: "session" | "window";
    sessionId: string;
    windowId?: string;
    text: string;
    isLast: boolean;
    depth: 0 | 1;
  }

  /** Flattened, visible rows — `$derived` straight off the live `client`
   * (never snapshotted at open-time), so an in-overlay kill (which mutates
   * `client` while `open` stays true) is reflected immediately; the
   * selection-clamp `$effect` below keeps `selectedIdx` valid whenever this
   * shrinks. */
  const rows = $derived.by((): Row[] => {
    const out: Row[] = [];
    for (const s of client.sessions) {
      const attached = client.attachedSessionId === s.id;
      const sessionText =
        chooseTree.sessionTemplate
          .replace("{name}", s.name)
          .replace("{n}", String(s.windows.length)) +
        (attached ? chooseTree.sessionAttachedSuffix : "");
      out.push({ kind: "session", sessionId: s.id, text: sessionText, isLast: true, depth: 0 });
      if (!expandedSessionIds.has(s.id)) continue;
      s.windows.forEach((w, wi) => {
        const flag =
          wi === s.activeWindowIdx
            ? "*"
            : wi === s.lastWindowIdx && s.lastWindowIdx !== s.activeWindowIdx
              ? "-"
              : "";
        const windowText =
          chooseTree.windowTemplate.replace("{index}", String(w.number)).replace("{name}", w.name) +
          flag;
        out.push({
          kind: "window",
          sessionId: s.id,
          windowId: w.id,
          text: windowText,
          isLast: wi === s.windows.length - 1,
          depth: 1,
        });
      });
    }
    return out;
  });

  // Keeps `selectedIdx` in range whenever `rows` shrinks (an in-overlay kill,
  // or a collapse) — reads `rows.length`, writes a DIFFERENT state var
  // (`selectedIdx`), so this isn't the read-then-write-the-SAME-$state
  // hazard despite living in an `$effect`.
  $effect(() => {
    if (selectedIdx >= rows.length) selectedIdx = Math.max(0, rows.length - 1);
  });

  const selectedRow = $derived<Row | undefined>(rows[selectedIdx]);

  const previewText = $derived.by((): string => {
    const row = selectedRow;
    if (!row) return "";
    const session = client.sessions.find((s) => s.id === row.sessionId);
    if (!session) return "";
    if (row.kind === "session") {
      return chooseTree.preview.sessionWindowsTemplate.replace(
        "{n}",
        String(session.windows.length),
      );
    }
    const win = session.windows.find((w) => w.id === row.windowId);
    if (!win) return "";
    const programs = allPanes(win.root)
      .map((p) => p.program)
      .join(", ");
    const layout = win.lastLayout ?? chooseTree.preview.noLayoutText;
    return `${chooseTree.preview.windowPanesLabel} ${programs}  ${chooseTree.preview.windowLayoutLabel} ${layout}`;
  });

  /** `Ctrl-b w` — opens with the current session expanded (every other
   * collapsed) and the current window pre-selected; falls back to row 0
   * when the attached session/window can't be found. */
  export function openOverlay(): void {
    const attachedId = client.attachedSessionId;
    expandedSessionIds = new Set(attachedId ? [attachedId] : []);
    killPrompt = null;
    open = true;

    const session = client.sessions.find((s) => s.id === attachedId);
    if (!session) {
      selectedIdx = 0;
      return;
    }
    const activeWindowId = session.windows[session.activeWindowIdx]?.id;
    const idx = rows.findIndex(
      (r) => r.kind === "window" && r.sessionId === attachedId && r.windowId === activeWindowId,
    );
    selectedIdx = idx === -1 ? 0 : idx;
  }

  export function isOpen(): boolean {
    return open;
  }

  export function close(): void {
    open = false;
    killPrompt = null;
  }

  function move(dir: 1 | -1): void {
    if (rows.length === 0) return;
    selectedIdx = Math.max(0, Math.min(rows.length - 1, selectedIdx + dir));
  }

  function collapseOrParent(): void {
    const row = selectedRow;
    if (!row) return;
    if (row.kind === "session") {
      if (!expandedSessionIds.has(row.sessionId)) return;
      const next = new Set(expandedSessionIds);
      next.delete(row.sessionId);
      expandedSessionIds = next;
      return;
    }
    // Window row — jump to its parent session row (real tmux: left on a
    // child moves selection UP to the parent; a second left there collapses
    // it).
    const parentIdx = rows.findIndex((r) => r.kind === "session" && r.sessionId === row.sessionId);
    if (parentIdx !== -1) selectedIdx = parentIdx;
  }

  function expand(): void {
    const row = selectedRow;
    if (!row || row.kind !== "session" || expandedSessionIds.has(row.sessionId)) return;
    const next = new Set(expandedSessionIds);
    next.add(row.sessionId);
    expandedSessionIds = next;
  }

  function selectAndClose(): void {
    const row = selectedRow;
    if (!row) return;
    if (row.kind === "window" && row.windowId) onSelectWindow(row.sessionId, row.windowId);
    else onSelectSession(row.sessionId);
    close();
  }

  function openKillPrompt(): void {
    const row = selectedRow;
    if (!row) return;
    const session = client.sessions.find((s) => s.id === row.sessionId);
    if (!session) return;
    if (row.kind === "window") {
      const win = session.windows.find((w) => w.id === row.windowId);
      const text = chooseTree.killWindowPromptTemplate.replace(
        "{index}",
        String(win?.number ?? ""),
      );
      killPrompt = { kind: "window", sessionId: row.sessionId, windowId: row.windowId, text };
    } else {
      const text = chooseTree.killSessionPromptTemplate.replace("{name}", session.name);
      killPrompt = { kind: "session", sessionId: row.sessionId, text };
    }
  }

  export function handleKey(e: KeyboardEvent): boolean {
    if (!open) return false;
    if (e.metaKey || e.ctrlKey || e.altKey) return true; // owns the keyboard — swallow, no action

    // In-overlay kill sub-prompt — a documented quirk: confirm is
    // CASE-INSENSITIVE on y here (unlike every
    // other kill confirm in the app, which is lowercase-only); ANY other key
    // cancels just this sub-prompt, leaving the overlay itself open.
    if (killPrompt) {
      if (e.key.toLowerCase() === "y") {
        if (killPrompt.kind === "window" && killPrompt.windowId)
          onKillWindow(killPrompt.sessionId, killPrompt.windowId);
        else onKillSession(killPrompt.sessionId);
        killPrompt = null;
        return true;
      }
      killPrompt = null;
      return true;
    }

    if (e.key === "Escape" || e.key.toLowerCase() === "q") {
      close();
      return true;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
      return true;
    }
    if (e.key === "h" || e.key === "ArrowLeft") {
      e.preventDefault();
      collapseOrParent();
      return true;
    }
    if (e.key === "l" || e.key === "ArrowRight") {
      e.preventDefault();
      expand();
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      selectAndClose();
      return true;
    }
    if (e.key.toLowerCase() === "x") {
      e.preventDefault();
      openKillPrompt();
      return true;
    }

    // Everything else (incl. `?` — the help palette must NOT open while
    // this overlay is open) is silently swallowed.
    if (e.key.length === 1) e.preventDefault();
    return true;
  }
</script>

{#if open}
  <div
    data-testid="choose-tree-overlay"
    style="position:fixed;left:0;top:0;right:0;bottom:{STATUS_BAR_HEIGHT_PX}px;z-index:50;background:#0b0f14;display:flex;flex-direction:column;padding:18px 22px 14px"
  >
    <div
      style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column;background:rgba(9,13,18,.6);backdrop-filter:blur(3px);border:1px solid rgba(224,69,60,.4);border-radius:5px;padding:16px 18px 12px;font-size:13px;box-shadow:0 24px 80px rgba(0,0,0,.5)"
    >
      <div
        style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#0a0e13;padding:0 10px;color:#e0453c;letter-spacing:.14em"
      >
        {chooseTree.titlePrefix}<span style="color:#5fc6b4">{chooseTree.titleTilde}</span>
      </div>

      <div
        data-testid="choose-tree-rows"
        style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;padding-top:6px"
      >
        {#each rows as row, i (row.kind + ":" + row.sessionId + ":" + (row.windowId ?? ""))}
          <div
            role="button"
            tabindex="0"
            data-testid={row.kind === "session"
              ? "choose-tree-session-row"
              : "choose-tree-window-row"}
            data-session-id={row.sessionId}
            data-window-id={row.windowId ?? ""}
            data-selected={i === selectedIdx}
            onclick={() => (selectedIdx = i)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") selectedIdx = i;
            }}
            style="cursor:pointer;white-space:pre;padding:2px 6px;{i === selectedIdx
              ? 'background:rgba(224,69,60,.22);color:#f0e7e4'
              : 'color:rgba(196,216,232,.8)'}"
          >
            {row.depth === 1 ? `${row.isLast ? "└─ " : "├─ "}${row.text}` : row.text}
          </div>
        {/each}
      </div>

      {#if killPrompt}
        <div
          data-testid="choose-tree-kill-confirm"
          style="flex:none;padding:6px 10px 0;color:#e0453c"
        >
          {killPrompt.text}
        </div>
      {:else}
        <div
          data-testid="choose-tree-preview"
          style="flex:none;padding:6px 10px 0;border-top:1px solid rgba(224,69,60,.18);color:rgba(196,216,232,.6);font-size:12px"
        >
          {previewText}
        </div>
      {/if}

      <div style="flex:none;padding:4px 10px 0;color:rgba(196,216,232,.42);font-size:12px">
        {chooseTree.hint}
      </div>
    </div>
  </div>
{/if}
