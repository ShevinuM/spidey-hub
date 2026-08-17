<script lang="ts">
  // tmux copy-mode overlay (PLAN.md Phase 5 item 5.3 / #12, `Ctrl-b [`).
  // Generic — one instance, always mounted in Terminal.svelte (same
  // always-mounted / bind:this / handleKey():boolean contract as
  // GrepOverlay), reused across every view: each view marks its own
  // "primary pane" with a bare `data-copy-source` attribute (Editor.svelte's
  // scroller — shared by both Builds and Personnel's file editor —,
  // Builds.svelte's currently-FOCUSED panel, Personnel.svelte's row list,
  // Profile.svelte's summary block, Wallpaper.svelte's left HUD `<pre>`
  // (only while `view === "retina-v"`), HelpView.svelte's scroller, and
  // Dashboard.svelte's menu). Exactly one such element exists in the DOM at
  // any given moment — Terminal.svelte only ever mounts one view's
  // component tree at a time, and Wallpaper's own attribute is conditional
  // on the tracker view being active — so a single, untargeted
  // `document.querySelector('[data-copy-source]')` at open-time is enough
  // to find "the active pane" with no view-aware wiring needed here.
  //
  // Deliberately reuses src/lib/vim.ts's pure motion helpers (clampCursor /
  // moveHorizontal / moveVertical / normalizeCharRange / extractCharRange)
  // rather than re-deriving cursor math — same engine Editor.svelte's vim-
  // lite mode already uses, applied here to captured plain text instead of
  // a live buffer. Feature set is intentionally smaller than the full
  // editor (PLAN.md's own wording): h/l/j/k/gg/G/Ctrl-d/u navigation, `v`
  // charwise selection only (no VISUAL LINE), `y`/Enter yank-and-exit. `q`
  // IS a valid exit key here — real tmux's copy-mode uses bare `q`, and
  // PLAN.md explicitly calls this out as "the one place bare q is allowed"
  // despite items 15/16 banning it everywhere else as a navigation key (this
  // never navigates a view, only closes the overlay it belongs to).
  import {
    clampCursor,
    extractCharRange,
    moveHorizontal,
    moveVertical,
    normalizeCharRange,
    type CursorPos,
  } from "../lib/vim";
  import { setPasteBuffer, writeToSystemClipboard } from "../lib/pasteBuffer";
  import type { CopyModeData } from "../lib/data";
  import { STATUS_BAR_HEIGHT_PX } from "../lib/layout";

  interface Props {
    copyMode: CopyModeData;
  }

  const { copyMode }: Props = $props();

  const HALF_PAGE_LINES = 10;

  let open = $state(false);
  let lines = $state<string[]>([]);
  let cursor = $state<CursorPos>({ line: 1, col: 0 });
  let mode = $state<"normal" | "visual">("normal");
  let anchor = $state<CursorPos | null>(null);

  let gPending = false;
  let gTimer: ReturnType<typeof setTimeout> | undefined;

  let overlayEl = $state<HTMLElement | null>(null);

  /** Keeps the cursor's own line scrolled into view as it moves — the lines
   * container renders every captured line at once (`overflow-y:auto`), so
   * without this a long capture (help content, a big editor buffer) would
   * let `G`/Ctrl-d walk the cursor right off the visible viewport while the
   * scroll position stayed put. Svelte 5 effects run after the DOM update
   * that changed `cursor`/`open`, so the cursor span already reflects the
   * new position by the time this queries for it — no extra tick needed. */
  $effect(() => {
    if (!open) return;
    void cursor; // tracked dependency — re-run on every cursor move
    overlayEl?.querySelector<HTMLElement>('[data-testid="copy-mode-cursor"]')?.scrollIntoView({ block: "nearest" });
  });

  /** Ctrl-b [ — captures the current active pane's rendered text as lines.
   * An empty/missing source still opens (rendering `copyMode.emptyText`)
   * rather than silently doing nothing, so the binding always gives visible
   * feedback. */
  export function openOverlay(): void {
    const el = document.querySelector<HTMLElement>("[data-copy-source]");
    const text = el?.innerText ?? "";
    lines = text.length > 0 ? text.split("\n") : [""];
    cursor = { line: 1, col: 0 };
    mode = "normal";
    anchor = null;
    gPending = false;
    clearTimeout(gTimer);
    open = true;
  }

  /** Exported (PLAN.md Phase 5B item 5B.3) so Terminal.svelte's ↻ reboot
   * handler can close a stray copy-mode overlay the same way it already
   * closes a stray grep overlay (`grepRef.close()`) before switching to the
   * dashboard and replaying boot — copy-mode's own z-index (50) sits above
   * the status bar, so its "↻ reboot" click would otherwise land on a
   * dead overlay instead of the dashboard underneath. */
  export function close(): void {
    open = false;
    gPending = false;
    clearTimeout(gTimer);
  }

  function setCursor(pos: CursorPos): void {
    cursor = clampCursor(lines, pos);
  }

  /** `y` / Enter — yanks the active charwise selection, or (no selection
   * started) the cursor's current line, then exits — mirrors GrepOverlay's
   * own Enter-always-closes convention. */
  function yankAndClose(): void {
    const text =
      mode === "visual" && anchor
        ? extractCharRange(lines, normalizeCharRange(anchor, cursor))
        : (lines[cursor.line - 1] ?? "");
    setPasteBuffer(text, mode === "visual" ? "char" : "line");
    writeToSystemClipboard(text);
    close();
  }

  export function handleKey(e: KeyboardEvent): boolean {
    if (!open) return false;

    if (e.key === "Escape" || (e.key.toLowerCase() === "q" && !e.metaKey && !e.ctrlKey && !e.altKey)) {
      close();
      return true;
    }

    if (e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "d") {
        e.preventDefault();
        setCursor({ line: cursor.line + HALF_PAGE_LINES, col: cursor.col });
        return true;
      }
      if (k === "u") {
        e.preventDefault();
        setCursor({ line: cursor.line - HALF_PAGE_LINES, col: cursor.col });
        return true;
      }
      return true; // other ctrl combos: swallow, no action
    }
    if (e.metaKey || e.altKey) return true;

    const key = e.key;
    if (key !== "g") {
      gPending = false;
      clearTimeout(gTimer);
    }

    if (key === "v") {
      e.preventDefault();
      if (mode === "visual") {
        mode = "normal";
        anchor = null;
      } else {
        mode = "visual";
        anchor = cursor;
      }
      return true;
    }
    if (key === "h" || key === "ArrowLeft") {
      e.preventDefault();
      setCursor(moveHorizontal(lines, cursor, -1));
      return true;
    }
    if (key === "l" || key === "ArrowRight") {
      e.preventDefault();
      setCursor(moveHorizontal(lines, cursor, 1));
      return true;
    }
    if (key === "j" || key === "ArrowDown") {
      e.preventDefault();
      setCursor(moveVertical(lines, cursor, 1));
      return true;
    }
    if (key === "k" || key === "ArrowUp") {
      e.preventDefault();
      setCursor(moveVertical(lines, cursor, -1));
      return true;
    }
    if (key === "G") {
      e.preventDefault();
      setCursor({ line: lines.length, col: 0 });
      return true;
    }
    if (key === "g") {
      e.preventDefault();
      if (gPending) {
        clearTimeout(gTimer);
        gPending = false;
        setCursor({ line: 1, col: 0 });
      } else {
        gPending = true;
        gTimer = setTimeout(() => (gPending = false), 500);
      }
      return true;
    }
    if (key === "y" || key === "Enter") {
      e.preventDefault();
      yankAndClose();
      return true;
    }

    if (key.length === 1) e.preventDefault();
    return true;
  }

  interface RenderLine {
    n: number;
    text: string;
    segments: { text: string; cls: string }[];
  }

  const selRange = $derived(mode === "visual" && anchor ? normalizeCharRange(anchor, cursor) : null);

  const renderLines = $derived.by((): RenderLine[] =>
    lines.map((text, i): RenderLine => {
      const lineNo = i + 1;
      const isCursorLine = lineNo === cursor.line;
      const t = text === "" ? " " : text;

      const cuts = new Set<number>([0, t.length]);
      if (isCursorLine) {
        cuts.add(Math.min(t.length, cursor.col));
        cuts.add(Math.min(t.length, cursor.col + 1));
      }
      let selStart = -1;
      let selEnd = -1;
      if (selRange && lineNo >= selRange.startLine && lineNo <= selRange.endLine) {
        selStart = lineNo === selRange.startLine ? selRange.startCol : 0;
        selEnd = lineNo === selRange.endLine ? selRange.endCol : Math.max(0, t.length - 1);
        cuts.add(Math.min(t.length, selStart));
        cuts.add(Math.min(t.length, selEnd + 1));
      }
      const points = [...cuts].sort((a, b) => a - b);
      const segments: { text: string; cls: string }[] = [];
      for (let p = 0; p < points.length - 1; p++) {
        const s = points[p];
        const eIdx = points[p + 1];
        if (s >= eIdx) continue;
        const classes: string[] = [];
        if (selStart !== -1 && s >= selStart && eIdx <= selEnd + 1) classes.push("sel");
        if (isCursorLine && s >= cursor.col && eIdx <= cursor.col + 1) classes.push("cursor");
        segments.push({ text: t.slice(s, eIdx), cls: classes.join(" ") });
      }
      return { n: lineNo, text: t, segments };
    }),
  );

  function segStyle(cls: string): string | undefined {
    if (cls.includes("cursor")) return "background:#e0453c;color:#0b0f14";
    if (cls.includes("sel")) return "background:rgba(224,69,60,.22);color:#f4ece9";
    return undefined;
  }

  /** Same precedence as segStyle — one testid per segment, mirroring
   * Editor.svelte's own segTestId (PLAN.md Phase 5.4 e2e coverage: nav
   * moves the cursor, v/motion highlights a selection). */
  function segTestId(cls: string): string | undefined {
    if (cls.includes("cursor")) return "copy-mode-cursor";
    if (cls.includes("sel")) return "copy-mode-selection";
    return undefined;
  }
</script>

{#if open}
  <div
    data-testid="copy-mode-overlay"
    style="position:fixed;left:0;top:0;right:0;bottom:{STATUS_BAR_HEIGHT_PX}px;z-index:50;background:rgba(6,9,13,.55);backdrop-filter:blur(2.5px);display:flex;align-items:center;justify-content:center;padding:4vh 3vw"
  >
    <div
      style="position:relative;width:min(900px,92vw);height:min(640px,80vh);box-sizing:border-box;display:flex;flex-direction:column;border:1px solid rgba(224,69,60,.55);border-radius:4px;background:rgba(9,13,18,.94);padding:10px 2px 6px;font-size:13px;line-height:1.6"
    >
      <div
        style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:7px;background:#0a0e13;padding:0 10px;color:#e0453c;letter-spacing:.16em"
      >
        {copyMode.titlePrefix}<span style="color:#5fc6b4">{copyMode.titleTilde}</span>
      </div>
      <div bind:this={overlayEl} data-testid="copy-mode-lines" style="flex:1;min-height:0;overflow-y:auto;padding:6px 10px">
        {#if lines.length === 1 && lines[0] === ""}
          <div style="color:rgba(196,216,232,.5)">{copyMode.emptyText}</div>
        {:else}
          {#each renderLines as l (l.n)}
            <div data-copy-mode-line={l.n} style="display:flex;gap:14px;white-space:pre">
              <span style="flex:none;width:34px;text-align:right;color:rgba(224,69,60,.4)">{l.n}</span>
              <span style="color:rgba(196,216,232,.75)"
                >{#each l.segments as seg}<span style={segStyle(seg.cls)} data-testid={segTestId(seg.cls)}
                    >{seg.text}</span
                  >{/each}</span
              >
            </div>
          {/each}
        {/if}
      </div>
      <div
        style="flex:none;padding:4px 10px 0;border-top:1px solid rgba(224,69,60,.18);color:rgba(196,216,232,.42);font-size:12px"
      >
        {copyMode.hint}
      </div>
    </div>
  </div>
{/if}
