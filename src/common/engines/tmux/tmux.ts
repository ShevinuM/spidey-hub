// tmux client/session/window/pane model — 100% pure, no DOM, no Svelte imports, unit-testable like vim.ts.
//
// Every operation mutates its argument(s) in place and leaves the client fully consistent at return, whether the object is a plain object (unit tests) or a Svelte 5 `$state` proxy (Terminal.svelte).
//
// Pane ids are a deterministic function of (windowId, index), never a module-level counter or `Math.random()`, so a `reboot()` rebuild is byte-for-byte reproducible.

import { createShellState, type ShellLine, type ShellState } from "../../lib/shell";

/** A pane's currently-running program; "shell" is the in-window shell a program's `:q` drops back to, and every other value is one of bootstrap's registered window ids, injected by the caller (architecture R007: this engine knows no feature names). */
export type ProgramName = string;

export interface Pane {
  id: string;
  program: ProgramName;
  /** Every pane carries its own shell buffer from creation, since a pane's program can `:q` away and back and the buffer must survive that round-trip like a real tmux pane's scrollback. */
  shell: ShellState;
}

export interface PaneLeaf {
  type: "leaf";
  pane: Pane;
}

/**
 * A real tmux split: N children laid out along `direction` (`"row"` = side by side, `"column"` = stacked), each taking the parallel fraction in `sizes`, always summing to ~1.
 *
 * N-ary, not strictly binary, so a single split node can represent an entire preset layout's row or column in one level, though a manual split still only ever inserts one new child at a time.
 */
export interface SplitNode {
  type: "split";
  direction: "row" | "column";
  children: PaneNode[];
  sizes: number[];
}

export type PaneNode = PaneLeaf | SplitNode;

export interface Window {
  id: string;
  number: number;
  name: string;
  /** True until a manual `Ctrl-b ,` rename; while true, `setPaneProgram` keeps `name` synced to the focused pane's program. */
  autoName: boolean;
  root: PaneNode;
  /** Which pane (by id) is focused for keyboard delegation within this window. */
  activePaneId: string;
  /** Prefix `;`'s target: the pane focused immediately before the current one, undefined until focus has moved at least once. */
  lastPaneId?: string | undefined;
  /**
   * Every pane id currently in this window's tree, in creation order; index 0 is the "main" pane for the main-* layouts, and a pane's position here is its `pane_index` in the kill-pane prompt.
   *
   * Renumbered on every kill (indices always `0..n-1`, no gaps); layout application never reorders this array.
   */
  paneOrder: string[];
  /** A monotonic per-window counter backing every new pane id, never derived from `paneOrder.length`, so a kill-then-split sequence can never mint a colliding id. */
  paneSeq: number;
  /**
   * The last preset applied via `Ctrl-b Space`/`select-layout`; undefined means never applied, so the next bare Space starts the cycle at `even-horizontal`.
   *
   * A manual split does not reset this — real tmux only tracks the last applied preset.
   */
  lastLayout?: LayoutName;
}

export interface Session {
  id: string;
  name: string;
  windows: Window[];
  activeWindowIdx: number;
  /** The index of whichever window was active immediately before the current one — real tmux's "last window", surfaced as the `-` status-bar flag. */
  lastWindowIdx: number;
  /** Frozen page-clock epoch this session was created at, for `tmux ls`'s "created {ctime}" column. */
  createdAt: number;
  /**
   * A logical recency counter for "most recently used unattached session", not a clock read, since a pinned test clock would collapse every session's `createdAt` to the same instant and miscompute the pick.
   *
   * `0` until a session has ever been attached.
   */
  lastAttachedSeq: number;
}

export interface Client {
  sessions: Session[];
  /** Null once detached; the host shell (`Client.hostPane`) owns the keyboard instead. */
  attachedSessionId: string | null;
  /** Monotonic counter backing `Session.lastAttachedSeq`, bumped by every `attachSession()` call. */
  attachSeq: number;
  /**
   * The detached host shell's own pane, modeled as a real `Pane` (not a bare `ShellState`) so Shell.svelte can mount it with its existing `pane: Pane` prop contract unchanged.
   *
   * Survives detach/re-attach cycles; only `createFactoryClient()` (reboot) resets it.
   */
  hostPane: Pane;
}

// Pane-tree helpers (written against the PaneNode union).

/** Every pane reachable from `node`, in tree order (depth-first, children in
 * array order). */
export function allPanes(node: PaneNode): Pane[] {
  if (node.type === "leaf") return [node.pane];
  return node.children.flatMap(allPanes);
}

export function findPaneById(node: PaneNode, paneId: string): Pane | undefined {
  if (node.type === "leaf") return node.pane.id === paneId ? node.pane : undefined;
  for (const child of node.children) {
    const found = findPaneById(child, paneId);
    if (found) return found;
  }
  return undefined;
}

/** The window that owns `paneId`, wherever it is in the session
 * (`onExitPane`/kill-pane call sites need to resolve an ARBITRARY pane's
 * owning window, not just the currently-active one, since a session can
 * have more than one pane per window). */
export function windowOfPane(session: Session, paneId: string): Window | undefined {
  return session.windows.find((w) => allPanes(w.root).some((p) => p.id === paneId));
}

// Pane-tree rewrite helpers: `splitPane`/`killPaneInWindow` walk the tree by paneId and rebuild new objects back up to the root, structural-sharing every untouched subtree.

/**
 * Removes the leaf pane `paneId` from `node`, renormalizing its parent split's `sizes` to still sum to ~1, and collapsing a split down to a bare node once only one child remains.
 *
 * Returns `null` when `node` itself was the pane being removed; the caller handles the "kill the last pane" cascade.
 */
function removePaneNode(node: PaneNode, paneId: string): PaneNode | null {
  if (node.type === "leaf") return node.pane.id === paneId ? null : node;

  const idx = node.children.findIndex((c) => allPanes(c).some((p) => p.id === paneId));
  if (idx === -1) return node; // not under this subtree at all — defensive, unreachable in practice

  const rewritten = removePaneNode(node.children[idx], paneId);
  if (rewritten === null) {
    // The pane was the direct child at `idx`; drop it and renormalize the remaining shares to sum back to 1.
    const remainingChildren = node.children.filter((_, i) => i !== idx);
    const remainingSizesRaw = node.sizes.filter((_, i) => i !== idx);
    const total = remainingSizesRaw.reduce((a, b) => a + b, 0) || 1;
    const remainingSizes = remainingSizesRaw.map((s) => s / total);
    if (remainingChildren.length === 1) return remainingChildren[0];
    return { ...node, children: remainingChildren, sizes: remainingSizes };
  }

  // The pane was deeper down; splice the rewritten subtree back in place.
  const children = [...node.children];
  children[idx] = rewritten;
  return { ...node, children };
}

/** The window's currently-focused pane, falling back to the tree's first pane defensively. */
export function focusedPane(window: Window): Pane {
  return findPaneById(window.root, window.activePaneId) ?? allPanes(window.root)[0];
}

// Pane focus / navigation (prefix `o`/arrows/`;`), all routed through `focusPane` so `lastPaneId` bookkeeping has one home.

/** Moves focus to `paneId`, a no-op if it's already focused or isn't part of this window at all. */
function focusPane(window: Window, paneId: string): void {
  if (paneId === window.activePaneId) return;
  if (!findPaneById(window.root, paneId)) return;
  window.lastPaneId = window.activePaneId;
  window.activePaneId = paneId;
}

/** Prefix `o` — next pane, cycling through `paneOrder`, wrapping; a no-op on a single-pane window. */
export function cycleNextPane(window: Window): void {
  const order = window.paneOrder;
  if (order.length <= 1) return;
  const idx = order.indexOf(window.activePaneId);
  const nextIdx = (idx + 1) % order.length;
  focusPane(window, order[nextIdx]);
}

/** Prefix `;` — jumps back to whichever pane was focused immediately before the current one; a no-op if nothing to jump to yet, or that pane has since been killed. */
export function focusLastPane(window: Window): void {
  const target = window.lastPaneId;
  if (!target) return;
  focusPane(window, target);
}

/** A pane's on-screen rect as fractions (0..1) of the window's content area, purely geometric with no pixels or DOM involved. */
export interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Walks the tree accumulating each leaf's rect — a split's `direction`
 * determines which axis its `sizes` subdivide (row = x/width, column =
 * y/height); every other axis is inherited unchanged from the parent. */
export function computePaneRects(
  node: PaneNode,
  rect: PaneRect = { x: 0, y: 0, w: 1, h: 1 },
  out: Map<string, PaneRect> = new Map(),
): Map<string, PaneRect> {
  if (node.type === "leaf") {
    out.set(node.pane.id, rect);
    return out;
  }
  let offset = 0;
  node.children.forEach((child, i) => {
    const size = node.sizes[i] ?? 0;
    const childRect: PaneRect =
      node.direction === "row"
        ? { x: rect.x + offset * rect.w, y: rect.y, w: rect.w * size, h: rect.h }
        : { x: rect.x, y: rect.y + offset * rect.h, w: rect.w, h: rect.h * size };
    computePaneRects(child, childRect, out);
    offset += size;
  });
  return out;
}

export type PaneDirection = "up" | "down" | "left" | "right";

/**
 * Geometric directional pick: among panes whose center lies strictly in `dir` from the focused pane's center, picks the closest on the primary axis, tie-breaking on the secondary axis.
 *
 * Candidates must also overlap the focused pane on the perpendicular axis, or a full-span pane (e.g. main-vertical's main pane) would wrongly out-distance its column neighbors by center-distance alone; with no overlapping candidate, this returns `undefined` rather than guessing a wrong-axis hop.
 */
export function findDirectionalPane(
  rects: Map<string, PaneRect>,
  fromId: string,
  dir: PaneDirection,
): string | undefined {
  const from = rects.get(fromId);
  if (!from) return undefined;
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const EPS = 1e-6;

  interface Candidate {
    id: string;
    primary: number;
    secondary: number;
    overlaps: boolean;
  }
  const candidates: Candidate[] = [];

  for (const [id, rect] of rects) {
    if (id === fromId) continue;
    const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };

    let inDirection: boolean;
    let primary: number;
    let secondary: number;
    let overlaps: boolean;
    if (dir === "right" || dir === "left") {
      inDirection = dir === "right" ? center.x > fromCenter.x + EPS : center.x < fromCenter.x - EPS;
      primary = Math.abs(center.x - fromCenter.x);
      secondary = Math.abs(center.y - fromCenter.y);
      overlaps = rect.y < from.y + from.h - EPS && rect.y + rect.h > from.y + EPS;
    } else {
      inDirection = dir === "down" ? center.y > fromCenter.y + EPS : center.y < fromCenter.y - EPS;
      primary = Math.abs(center.y - fromCenter.y);
      secondary = Math.abs(center.x - fromCenter.x);
      overlaps = rect.x < from.x + from.w - EPS && rect.x + rect.w > from.x + EPS;
    }
    if (!inDirection) continue;
    candidates.push({ id, primary, secondary, overlaps });
  }

  const overlapping = candidates.filter((c) => c.overlaps);

  let best: Candidate | undefined;
  for (const c of overlapping) {
    if (
      !best ||
      c.primary < best.primary - EPS ||
      (Math.abs(c.primary - best.primary) <= EPS && c.secondary < best.secondary)
    ) {
      best = c;
    }
  }
  return best?.id;
}

/** Prefix arrow keys — moves focus to the nearest pane geometrically in
 * `dir` from the CURRENT focused pane; a silent no-op (real tmux fidelity)
 * when there's no pane that way. */
export function focusDirectional(window: Window, dir: PaneDirection): void {
  const rects = computePaneRects(window.root);
  const target = findDirectionalPane(rects, window.activePaneId, dir);
  if (target) focusPane(window, target);
}

// Session/client lookup helpers

export function activeSessionOf(client: Client): Session | undefined {
  if (client.attachedSessionId === null) return undefined;
  return client.sessions.find((s) => s.id === client.attachedSessionId);
}

export function activeWindowOf(session: Session): Window {
  return session.windows[session.activeWindowIdx];
}

// Window selection / cycling

/** Selects `index` directly; a no-op, with no `lastWindowIdx` bookkeeping, when out of range or already active. */
export function selectWindowIndex(session: Session, index: number): void {
  if (index < 0 || index >= session.windows.length) return;
  if (index === session.activeWindowIdx) return;
  session.lastWindowIdx = session.activeWindowIdx;
  session.activeWindowIdx = index;
}

/** Prefix `n`/`p` — cycles by array position, wrapping. */
export function cycleWindow(session: Session, dir: 1 | -1): void {
  const len = session.windows.length;
  if (len === 0) return;
  selectWindowIndex(session, (session.activeWindowIdx + dir + len) % len);
}

// Rename / kill

/** `Ctrl-b ,` commit — disables auto-rename for this window permanently; a no-op if `windowId` doesn't exist. */
export function renameWindowManual(session: Session, windowId: string, name: string): void {
  const win = session.windows.find((w) => w.id === windowId);
  if (!win) return;
  win.name = name;
  win.autoName = false;
}

export type KillWindowResult = { ok: true } | { ok: false; reason: "only-window" };

/**
 * `Ctrl-b &` / `:kill-window` — refuses outright when this is the session's last window.
 *
 * Otherwise removes the window, falling back the active index to whichever window now sits at its old array position, wrapping to the first if it was last.
 */
export function killWindow(session: Session, windowId: string): KillWindowResult {
  if (session.windows.length <= 1) return { ok: false, reason: "only-window" };
  const idx = session.windows.findIndex((w) => w.id === windowId);
  if (idx === -1) return { ok: true }; // nothing to do — defensive, unreachable today

  const wasActive = idx === session.activeWindowIdx;
  const remaining = session.windows.filter((_, i) => i !== idx);
  session.windows = remaining;

  if (wasActive) {
    const fallback = remaining[idx] ?? remaining[0];
    const newIdx = fallback ? remaining.indexOf(fallback) : 0;
    session.activeWindowIdx = newIdx;
    session.lastWindowIdx = newIdx;
  } else {
    if (idx < session.activeWindowIdx) session.activeWindowIdx -= 1;
    if (idx < session.lastWindowIdx) session.lastWindowIdx -= 1;
  }

  // Defensive clamp, guaranteeing the "fully consistent at return" invariant even if an edge case slips through above.
  if (session.activeWindowIdx >= session.windows.length) {
    session.activeWindowIdx = Math.max(0, session.windows.length - 1);
  }
  if (session.lastWindowIdx >= session.windows.length) {
    session.lastWindowIdx = session.activeWindowIdx;
  }

  return { ok: true };
}

// Splits (`Ctrl-b |`/`%` and `-`/`"`)

/**
 * Real tmux's split rule: insert as a sibling if the target pane's immediate parent split already matches `direction`, otherwise wrap the target in a brand-new split of that direction.
 *
 * Rebuilds new objects back up to the root rather than mutating in place, the same convention `removePaneNode` uses.
 */
function insertSplit(
  node: PaneNode,
  targetPaneId: string,
  direction: "row" | "column",
  newLeaf: PaneLeaf,
): PaneNode {
  if (node.type === "leaf") {
    if (node.pane.id !== targetPaneId) return node;
    return { type: "split", direction, children: [node, newLeaf], sizes: [0.5, 0.5] };
  }

  const idx = node.children.findIndex((c) => allPanes(c).some((p) => p.id === targetPaneId));
  if (idx === -1) return node; // not under this subtree — defensive, unreachable in practice

  const child = node.children[idx];
  if (child.type === "leaf" && child.pane.id === targetPaneId && node.direction === direction) {
    // Same-orientation parent and target is a direct child: insert as an adjacent sibling, halving only the target's own share.
    const oldSize = node.sizes[idx];
    const half = oldSize / 2;
    const children = [...node.children];
    const sizes = [...node.sizes];
    children.splice(idx + 1, 0, newLeaf);
    sizes.splice(idx + 1, 0, half);
    sizes[idx] = half;
    return { ...node, children, sizes };
  }

  // Either the target is deeper down, or its parent's orientation doesn't match; recursing wraps just that leaf in a new split, spliced back in place.
  const rewrittenChild = insertSplit(child, targetPaneId, direction, newLeaf);
  const children = [...node.children];
  children[idx] = rewrittenChild;
  return { ...node, children };
}

/** `Ctrl-b |`/`%`/`-`/`"` — splits the focused pane 50/50 with a brand-new shell pane, which becomes the newly focused pane. */
export function splitPane(window: Window, direction: "row" | "column"): void {
  const focusedId = window.activePaneId;
  if (!findPaneById(window.root, focusedId)) return;

  const newPaneId = `${window.id}#${window.paneSeq}`;
  window.paneSeq += 1;
  const newPane: Pane = { id: newPaneId, program: "shell", shell: createShellState() };
  const newLeaf: PaneLeaf = { type: "leaf", pane: newPane };

  window.root = insertSplit(window.root, focusedId, direction, newLeaf);
  window.paneOrder = [...window.paneOrder, newPaneId];
  window.lastPaneId = window.activePaneId;
  window.activePaneId = newPaneId;
}

// Kill-pane

/** A pane's stable, live-renumbered position within its window, the `{pane_index}` in the `kill-pane {pane_index}? (y/n)` confirm prompt. */
export function paneIndexInWindow(window: Window, paneId: string): number {
  return window.paneOrder.indexOf(paneId);
}

export type KillPaneResult = { kind: "pane-removed" } | { kind: "last-pane" };

/**
 * Removes `paneId` from `window`'s tree; the caller decides what the "last pane" case cascades to, this function only handles "more than one pane" and reports back when it wasn't.
 *
 * Moves focus, if the killed pane was focused, to whichever pane sat right before it in creation order, wrapping to the new first pane if it was itself first.
 */
export function killPaneInWindow(window: Window, paneId: string): KillPaneResult {
  if (window.paneOrder.length <= 1) return { kind: "last-pane" };

  const rewritten = removePaneNode(window.root, paneId);
  if (rewritten === null) return { kind: "last-pane" }; // defensive — guarded above already

  window.root = rewritten;
  const idx = window.paneOrder.indexOf(paneId);
  window.paneOrder = window.paneOrder.filter((id) => id !== paneId);

  if (window.lastPaneId === paneId) window.lastPaneId = undefined;
  if (window.activePaneId === paneId) {
    const fallbackIdx = Math.max(0, idx - 1);
    window.activePaneId = window.paneOrder[fallbackIdx] ?? window.paneOrder[0];
  }

  return { kind: "pane-removed" };
}

// Layout engine (the 7 tmux presets and `Ctrl-b Space` / `select-layout`)

export const LAYOUT_NAMES = [
  "even-horizontal",
  "even-vertical",
  "main-horizontal",
  "main-horizontal-mirrored",
  "main-vertical",
  "main-vertical-mirrored",
  "tiled",
] as const;

export type LayoutName = (typeof LAYOUT_NAMES)[number];

export function isLayoutName(name: string): name is LayoutName {
  return (LAYOUT_NAMES as readonly string[]).includes(name);
}

/** The "big main pane" fraction for the main-* layouts; real tmux sizes its main pane with an absolute row/column count, not a percentage, so 60/40 is a deliberate approximation, not a ported exact value. */
const MAIN_PANE_FRACTION = 0.6;

function leafOf(pane: Pane): PaneLeaf {
  return { type: "leaf", pane };
}

function evenSizes(n: number): number[] {
  return Array.from({ length: n }, () => 1 / n);
}

function rowOf(children: PaneNode[], sizes: number[]): SplitNode {
  return { type: "split", direction: "row", children, sizes };
}

function columnOf(children: PaneNode[], sizes: number[]): SplitNode {
  return { type: "split", direction: "column", children, sizes };
}

/** Pure tree-builder for all 7 presets, taking `panes` in the window's stable `paneOrder` and returning a brand-new root, discarding whatever tree shape existed before. */
export function buildLayoutTree(panes: Pane[], layoutName: LayoutName): PaneNode {
  if (panes.length === 1) return leafOf(panes[0]);

  switch (layoutName) {
    case "even-horizontal":
      return rowOf(panes.map(leafOf), evenSizes(panes.length));

    case "even-vertical":
      return columnOf(panes.map(leafOf), evenSizes(panes.length));

    case "main-horizontal": {
      const [main, ...rest] = panes;
      return columnOf(
        [leafOf(main), rowOf(rest.map(leafOf), evenSizes(rest.length))],
        [MAIN_PANE_FRACTION, 1 - MAIN_PANE_FRACTION],
      );
    }

    case "main-horizontal-mirrored": {
      const [main, ...rest] = panes;
      return columnOf(
        [rowOf(rest.map(leafOf), evenSizes(rest.length)), leafOf(main)],
        [1 - MAIN_PANE_FRACTION, MAIN_PANE_FRACTION],
      );
    }

    case "main-vertical": {
      const [main, ...rest] = panes;
      return rowOf(
        [leafOf(main), columnOf(rest.map(leafOf), evenSizes(rest.length))],
        [MAIN_PANE_FRACTION, 1 - MAIN_PANE_FRACTION],
      );
    }

    case "main-vertical-mirrored": {
      const [main, ...rest] = panes;
      return rowOf(
        [columnOf(rest.map(leafOf), evenSizes(rest.length)), leafOf(main)],
        [1 - MAIN_PANE_FRACTION, MAIN_PANE_FRACTION],
      );
    }

    case "tiled": {
      // Near-even grid, cols = ceil(sqrt(n)) and rows = ceil(n/cols), matching real tmux's tiled arrangement for 2-5 panes.
      const n = panes.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rowsOfPanes: Pane[][] = [];
      for (let i = 0; i < n; i += cols) rowsOfPanes.push(panes.slice(i, i + cols));
      // The "no 1-child splits" invariant applies per row too: a short final row of exactly one pane is a bare leaf, not a 1-child row split.
      const rowNodes = rowsOfPanes.map((rowPanes) =>
        rowPanes.length === 1
          ? leafOf(rowPanes[0])
          : rowOf(rowPanes.map(leafOf), evenSizes(rowPanes.length)),
      );
      if (rowNodes.length === 1) return rowNodes[0];
      return columnOf(rowNodes, evenSizes(rowNodes.length));
    }
  }
}

/** `select-layout <name>` — applies `layoutName` to `window` now, rebuilding its tree from the current `paneOrder`, and records it as `lastLayout` so a following bare `Ctrl-b Space` continues from here. */
export function applyLayout(window: Window, layoutName: LayoutName): void {
  const panes = window.paneOrder
    .map((id) => findPaneById(window.root, id))
    .filter((p): p is Pane => !!p);
  if (panes.length === 0) return;
  window.root = buildLayoutTree(panes, layoutName);
  window.lastLayout = layoutName;
}

/** `Ctrl-b Space` — applies the next preset in the cycle, wrapping around, starting at `even-horizontal` the first time it's pressed on a window. */
export function nextLayout(window: Window): void {
  const currentIdx = window.lastLayout ? LAYOUT_NAMES.indexOf(window.lastLayout) : -1;
  const next = LAYOUT_NAMES[(currentIdx + 1) % LAYOUT_NAMES.length];
  applyLayout(window, next);
}

/** Bare `select-layout` — reapplies whatever preset was last applied, recomputed fresh against the current pane list; a silent no-op if none has ever been applied. */
export function reapplyLastLayout(window: Window): void {
  if (!window.lastLayout) return;
  applyLayout(window, window.lastLayout);
}

// Sessions

/** Bare `tmux a`/`attach`'s "most recently used unattached session": the highest `lastAttachedSeq`, or `undefined` for an empty list. */
function pickMostRecentSession(sessions: Session[]): Session | undefined {
  return [...sessions].sort((a, b) => b.lastAttachedSeq - a.lastAttachedSeq)[0];
}

/** Attaches the client to an existing session by id, bumping the recency counter so it becomes the new "most recently used" for the next bare `tmux a`. */
export function attachSession(client: Client, sessionId: string): void {
  const session = client.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  client.attachedSessionId = sessionId;
  client.attachSeq += 1;
  session.lastAttachedSeq = client.attachSeq;
}

/** `Ctrl-b d` — no session owns the keyboard afterward; the caller appends the detached-message line to `Client.hostPane`'s shell buffer. */
export function detachClient(client: Client): void {
  client.attachedSessionId = null;
}

/**
 * `tmux new [-s name]` — creates a brand-new session with exactly one window (`0:zsh`, auto-named, running a shell).
 *
 * Does not attach on its own; the caller pairs this with `attachSession()` immediately after.
 *
 * `name` must already be validated as non-duplicate by the caller.
 */
export function createSession(client: Client, name: string, epoch: number): Session {
  const sessionId = `session:${name}`;
  const windowId = `${sessionId}#w0`;
  const pane = makePane(windowId, 0, "shell");
  const window: Window = {
    id: windowId,
    number: 0,
    name: "zsh",
    autoName: true,
    root: { type: "leaf", pane },
    activePaneId: pane.id,
    paneOrder: [pane.id],
    paneSeq: 1,
  };
  const session: Session = {
    id: sessionId,
    name,
    windows: [window],
    activeWindowIdx: 0,
    lastWindowIdx: 0,
    createdAt: epoch,
    lastAttachedSeq: 0,
  };
  client.sessions = [...client.sessions, session];
  return session;
}

/**
 * `Ctrl-b c` — appends a brand-new, auto-named `zsh` window to `session`, numbered one past the highest window number currently in the session.
 *
 * Deliberately does not touch `activeWindowIdx`/`lastWindowIdx` itself; the caller pairs this with `selectWindowIndex(session, session.windows.length - 1)` immediately after, so `selectWindowIndex` stays the only place that invariant is bookkept.
 */
export function createWindow(session: Session): Window {
  const highest = session.windows.reduce((max, w) => Math.max(max, w.number), -1);
  const number = highest + 1;
  const windowId = `${session.id}#w${number}`;
  const pane = makePane(windowId, 0, "shell");
  const window: Window = {
    id: windowId,
    number,
    name: "zsh",
    autoName: true,
    root: { type: "leaf", pane },
    activePaneId: pane.id,
    paneOrder: [pane.id],
    paneSeq: 1,
  };
  session.windows = [...session.windows, window];
  return window;
}

export type KillWindowCascadeResult =
  | { kind: "window-removed" }
  /** `detachedToHost: true` means no sessions remain and the client is now fully detached; `false` means the client was silently switched to the most recently used remaining session. */
  | { kind: "session-destroyed"; detachedToHost: boolean };

/** Shared tail of "a session is being destroyed outright", removing it from `client.sessions` and, if it was the attached one, switching to the most-recently-used remaining session or detaching entirely if none remain. */
function destroySession(client: Client, sessionId: string): { detachedToHost: boolean } {
  client.sessions = client.sessions.filter((s) => s.id !== sessionId);
  if (client.attachedSessionId !== sessionId) return { detachedToHost: false };
  const next = pickMostRecentSession(client.sessions);
  if (!next) {
    client.attachedSessionId = null;
    return { detachedToHost: true };
  }
  client.attachedSessionId = next.id;
  client.attachSeq += 1;
  next.lastAttachedSeq = client.attachSeq;
  return { detachedToHost: false };
}

/**
 * `Ctrl-b &` / `:kill-window` / shell `exit` in the last pane of a window — unlike the plain `killWindow()` above, this cascades.
 *
 * Killing a window that isn't the session's last one just removes it; killing the last window destroys the session outright, real tmux's own behavior.
 */
export function killWindowCascade(
  client: Client,
  session: Session,
  windowId: string,
): KillWindowCascadeResult {
  if (session.windows.length <= 1) {
    const { detachedToHost } = destroySession(client, session.id);
    return { kind: "session-destroyed", detachedToHost };
  }
  killWindow(session, windowId);
  return { kind: "window-removed" };
}

/** choose-tree `x` on a session row — kills the whole session in one step, unlike `killWindowCascade`, which only destroys a session as a side effect of its last window dying. */
export function killSession(
  client: Client,
  sessionId: string,
): { kind: "session-destroyed"; detachedToHost: boolean } {
  const { detachedToHost } = destroySession(client, sessionId);
  return { kind: "session-destroyed", detachedToHost };
}

// Program launch/exit

/** A window's auto-rename text for a given program — every program's own
 * name verbatim, except the in-window shell, which is real tmux's own
 * `zsh`. */
export function programDisplayName(program: ProgramName): string {
  return program === "shell" ? "zsh" : program;
}

/** Sets `paneId`'s running program and, if its window hasn't been manually renamed, updates the window's auto-rename text to match; shared plumbing under both `launchProgram` and `exitProgram`. */
export function setPaneProgram(session: Session, paneId: string, program: ProgramName): void {
  const win = windowOfPane(session, paneId);
  if (!win) return;
  const pane = findPaneById(win.root, paneId);
  if (!pane) return;
  pane.program = program;
  if (win.autoName) win.name = programDisplayName(program);
}

/** Launches `program` in `paneId`; any pane can launch any program, even one already running elsewhere. */
export function launchProgram(session: Session, paneId: string, program: ProgramName): void {
  setPaneProgram(session, paneId, program);
}

/** `:q` / cmdline `q` — drops `paneId`'s program back to an in-window shell; idempotent, since exiting an already-shell pane just re-sets the same program. */
export function exitProgram(session: Session, paneId: string): void {
  setPaneProgram(session, paneId, "shell");
}

// Factory ("reboot = factory state")

export interface WindowSeed {
  id: string;
  number: number;
  name: string;
}

export interface FactoryOptions {
  /** Bare session name, not the status bar's own "Session: {name}" display string. */
  sessionName: string;
  /** Seed window list; every seed's `id` doubles as the window's initial program and its permanent identity, which never changes even once its pane runs some other program or a shell. */
  windows: WindowSeed[];
  /** Frozen page-clock epoch; this file never calls `Date.now()` itself. */
  epoch: number;
  /** Which window is active on creation, defaulting to the first seed when omitted or not found. */
  activeWindowId?: string;
  sessionId?: string;
  /** The detached host shell's pre-seeded scrollback; defaults to empty. */
  hostNarrative?: ShellLine[];
}

function makePane(windowId: string, index: number, program: ProgramName): Pane {
  // Deterministic id, a pure function of (windowId, index), so a factory rebuild always reproduces the same ids for the same tree shape.
  return { id: `${windowId}#${index}`, program, shell: createShellState() };
}

/** Builds a fresh, single-session client — the site's initial mount AND
 * every `reboot()` (reusable for both since it takes no hidden state). */
export function createFactoryClient(opts: FactoryOptions): Client {
  const sessionId = opts.sessionId ?? "session-0";

  const windows: Window[] = opts.windows.map((seed) => {
    const program = seed.id;
    const pane = makePane(seed.id, 0, program);
    return {
      id: seed.id,
      number: seed.number,
      name: seed.name,
      autoName: true,
      root: { type: "leaf", pane },
      activePaneId: pane.id,
      paneOrder: [pane.id],
      paneSeq: 1,
    };
  });

  const foundIdx = opts.activeWindowId ? windows.findIndex((w) => w.id === opts.activeWindowId) : 0;
  const activeIdx = foundIdx === -1 ? 0 : foundIdx;

  const session: Session = {
    id: sessionId,
    name: opts.sessionName,
    windows,
    activeWindowIdx: activeIdx,
    lastWindowIdx: activeIdx,
    createdAt: opts.epoch,
    // Attached immediately at creation, so this session is the "most recently used" one by construction.
    lastAttachedSeq: 1,
  };

  return {
    sessions: [session],
    attachedSessionId: sessionId,
    attachSeq: 1,
    hostPane: {
      id: "host",
      program: "shell",
      shell: { ...createShellState(), lines: opts.hostNarrative ?? [] },
    },
  };
}
