<script lang="ts">
  // Full-screen nvim-style file viewer (design/Homepage.dc.html lines
  // 317-336 markup, reproduced verbatim: red file tab, gutter + line, status
  // bar with NORMAL / branch / breadcrumb / position / close-hint). The
  // prototype only ever mounts this for a personnel role doc (Phase 6); this
  // component is built standalone here (PLAN.md Phase 5 scope item 3) so
  // Phase 5's repo-file browsing and Phase 6's personnel roles share one
  // implementation. It is deliberately "dumb": every string comes from the
  // `labels` prop (caller's own data file — builds.yaml for Phase 5,
  // personnel.yaml for Phase 6), every line is already classified+styled by
  // the caller (docline.ts for .md, a flat body color for code — see
  // Builds.svelte's `toEditorLines()`), and scrolling never touches
  // anything the caller doesn't explicitly own (no fetch, no routing).
  //
  // Scrolling is a PLAN.md "Builds interactivity extension" the prototype
  // has no precedent for (its role docs are short enough to never scroll):
  // j/k moves a line cursor (scrolled into view), Ctrl-d/Ctrl-u move a half
  // page, gg/G jump top/bottom, and the status line's position indicator
  // (Top/nn%/Bot + line:col) tracks real scroll position — computed from the
  // scroller's own scrollTop/scrollHeight/clientHeight rather than a
  // hardcoded line-height, since the rendered line pitch depends on the
  // container's `gap:1px` (measured from two adjacent rows' offsetTop, see
  // linePitch()) and must never assume a fixed px value.
  //
  // The prototype's own version of this pane uses `overflow:hidden` (never
  // scrolls — a personnel doc always fits). Real repo files can be much
  // longer, so this swaps in `overflow-y:auto` with the scrollbar hidden
  // both ways (Firefox/WebKit) — the only rendering difference from the
  // prototype's markup, and invisible whenever content fits (Phase 6's
  // 06-editor golden, which never scrolls, is unaffected).
  import type { EditorLabels } from "../lib/data";

  export interface EditorLine {
    n: number;
    t: string;
    style: string;
  }

  interface Props {
    fileName: string;
    lines: EditorLine[];
    labels: EditorLabels;
    breadcrumbLeft: string;
    breadcrumbRight: string;
    onClose: () => void;
  }

  const { fileName, lines, labels, breadcrumbLeft, breadcrumbRight, onClose }: Props = $props();

  let scrollerEl = $state<HTMLDivElement | null>(null);
  let cursorLine = $state(1);
  let scrollTopPx = $state(0);
  let clientHeightPx = $state(0);
  let scrollHeightPx = $state(0);

  function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
  }

  function syncScroll() {
    if (!scrollerEl) return;
    scrollTopPx = scrollerEl.scrollTop;
    clientHeightPx = scrollerEl.clientHeight;
    scrollHeightPx = scrollerEl.scrollHeight;
  }

  $effect(() => {
    syncScroll();
  });

  /** Row pitch (line height + the container's `gap:1px`), measured from two
   * adjacent rendered rows rather than assumed — see file header comment. */
  function linePitch(): number {
    if (!scrollerEl) return 21;
    const rows = scrollerEl.querySelectorAll<HTMLElement>("[data-line]");
    if (rows.length >= 2) return rows[1].offsetTop - rows[0].offsetTop;
    if (rows.length === 1) return rows[0].offsetHeight + 1;
    return 21;
  }

  function scrollToCursor() {
    const row = scrollerEl?.querySelector<HTMLElement>(`[data-line="${cursorLine}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }

  function moveCursor(dir: 1 | -1) {
    cursorLine = clamp(cursorLine + dir, 1, lines.length);
    scrollToCursor();
    syncScroll();
  }

  function halfPage(dir: 1 | -1) {
    if (!scrollerEl) return;
    const clientH = scrollerEl.clientHeight;
    const maxScroll = Math.max(0, scrollerEl.scrollHeight - clientH);
    scrollerEl.scrollTop = clamp(scrollerEl.scrollTop + dir * (clientH / 2), 0, maxScroll);
    const pitch = linePitch();
    const linesMoved = Math.max(1, Math.round(clientH / 2 / pitch)) * dir;
    cursorLine = clamp(cursorLine + linesMoved, 1, lines.length);
    syncScroll();
  }

  function jumpTop() {
    cursorLine = 1;
    if (scrollerEl) scrollerEl.scrollTop = 0;
    syncScroll();
  }

  function jumpBottom() {
    cursorLine = lines.length;
    if (scrollerEl) scrollerEl.scrollTop = scrollerEl.scrollHeight;
    syncScroll();
  }

  let gPending = false;
  let gTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Handles one keydown for this view. Returns true when consumed (caller —
   * Builds.svelte — must not also treat the key as a Builds-panel key or let
   * Terminal.svelte's generic q/Esc-to-dashboard fallback run).
   */
  export function handleKey(e: KeyboardEvent): boolean {
    if (e.key === "Escape" || e.key.toLowerCase() === "q") {
      gPending = false;
      onClose();
      return true;
    }

    if (e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "d") {
        halfPage(1);
        gPending = false;
        return true;
      }
      if (k === "u") {
        halfPage(-1);
        gPending = false;
        return true;
      }
      return false;
    }

    if (e.metaKey || e.altKey) return false;

    if (e.key === "j" || e.key === "ArrowDown") {
      moveCursor(1);
      gPending = false;
      return true;
    }
    if (e.key === "k" || e.key === "ArrowUp") {
      moveCursor(-1);
      gPending = false;
      return true;
    }
    if (e.key === "G") {
      jumpBottom();
      gPending = false;
      return true;
    }
    if (e.key === "g") {
      if (gPending) {
        clearTimeout(gTimer);
        gPending = false;
        jumpTop();
      } else {
        gPending = true;
        gTimer = setTimeout(() => (gPending = false), 600);
      }
      return true;
    }

    gPending = false;
    return false;
  }

  const scrollLabel = $derived.by(() => {
    if (scrollHeightPx <= clientHeightPx || scrollTopPx <= 0) return labels.topLabel;
    if (scrollTopPx + clientHeightPx >= scrollHeightPx - 1) return labels.bottomLabel;
    const pct = Math.round((scrollTopPx / (scrollHeightPx - clientHeightPx)) * 100);
    return labels.percentTemplate.replace("{n}", String(pct));
  });

  const positionText = $derived(
    labels.positionTemplate.replace("{line}", String(cursorLine)).replace("{col}", "1"),
  );
</script>

<div style="flex:1;min-height:0;display:flex;flex-direction:column;background:rgba(8,11,15,.97);font-size:13px">
  <div style="flex:none;display:flex;justify-content:flex-end;padding:8px 12px 4px">
    <div
      style="display:flex;align-items:center;gap:7px;background:#e0453c;color:#0b0f14;padding:3px 12px;border-radius:3px;font-weight:700"
    >
      {labels.tabIcon} {fileName}
    </div>
  </div>
  <div
    bind:this={scrollerEl}
    onscroll={syncScroll}
    class="editor-scroller"
    data-testid="editor-scroller"
    style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:1px;padding:2px 14px"
  >
    {#each lines as l (l.n)}
      <div data-line={l.n} style="display:flex;gap:16px">
        <span style="flex:none;width:26px;text-align:right;color:rgba(224,69,60,.4)">{l.n}</span><span
          data-testid="editor-line-text"
          style={l.style}>{l.t}</span
        >
      </div>
    {/each}
  </div>
  <div style="flex:none;display:flex;align-items:center;background:#0e1a20;font-size:12px">
    <span style="background:#e0453c;color:#0b0f14;font-weight:700;padding:3px 12px">{labels.modeLabel}</span>
    <span style="background:rgba(224,69,60,.22);color:#f0d9d4;padding:3px 12px">{labels.branch}</span>
    <span style="color:rgba(196,216,232,.6);padding:3px 12px"
      >{breadcrumbLeft} {labels.breadcrumbSeparator} {breadcrumbRight}</span
    >
    <span style="flex:1"></span>
    <span data-testid="editor-position" style="color:#5fc6b4;padding:3px 12px">{scrollLabel} {positionText}</span>
    <span style="background:rgba(95,198,180,.2);color:#5fc6b4;padding:3px 12px">{labels.closeHint}</span>
  </div>
</div>

<style>
  .editor-scroller {
    scrollbar-width: none;
  }
  .editor-scroller::-webkit-scrollbar {
    display: none;
  }
</style>
