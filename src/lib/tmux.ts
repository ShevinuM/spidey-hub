// tmux client/session/window/pane model — 100% pure, no DOM, no Svelte
// imports, unit-testable exactly like src/lib/vim.ts/boot.ts.
// Terminal.svelte owns exactly one `$state` `Client` object and calls into
// the operations below to mutate it; every operation mutates its
// argument(s) in place and leaves the client fully consistent at return (no
// intermediate state where e.g. `windows` has shrunk but
// `activeWindowIdx`/`lastWindowIdx` still point past the end) — that
// in-place mutation works identically whether the object passed in is a
// plain object (unit tests) or a Svelte 5 `$state` proxy (Terminal.svelte).
//
// Pane ids are a deterministic function of (windowId, index) — never a
// module-level counter or `Math.random()` — so a `reboot()` factory rebuild
// is byte-for-byte reproducible and every id is stable within a given tree
// shape.

import { createShellState, type ShellLine, type ShellState } from "./shell.ts";

/** A pane's currently-running program. "shell" is the in-window shell a
 * program's `:q` drops back to — every OTHER value is one of the site's six
 * view components, reused verbatim as the window's own auto-rename text
 * (see `programDisplayName` below). */
export type ProgramName = "dashboard" | "repositories" | "employment" | "profile" | "retina-v" | "help" | "shell";

export interface Pane {
  id: string;
  program: ProgramName;
  /** Every pane carries its own shell buffer from creation, not just once it
   * becomes a shell: any pane can `:q` its program away and back, and the
   * buffer must survive that round-trip (and switching away from/back to
   * the window entirely) exactly like a real tmux pane's scrollback — only
   * `reboot()`/a page reload resets it. Lives here (not component-local
   * Svelte state) for exactly that reason. */
  shell: ShellState;
}

export interface PaneLeaf {
  type: "leaf";
  pane: Pane;
}

/** A real tmux split: N children laid
 * out along `direction` (`"row"` = side by side, left→right, real tmux's
 * `split-window -h`; `"column"` = stacked, top→bottom, `-v`), each taking the
 * parallel fraction in `sizes` (same index, always summing to ~1 and always
 * the same length as `children` — every op below that mutates a split node
 * maintains this invariant, unit-tested directly). N-ary (not strictly
 * binary) so a single split node can represent an ENTIRE preset layout's row
 * or column in one level (e.g. `tiled`'s grid is a column-of-rows, each row
 * one split node with as many children as that row has panes) — real tmux's
 * own layout cell tree is shaped the same way. A manual `|`/`-` split
 * (`splitPane` below) still only ever inserts ONE new child at a time. */
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
  /** True until a manual `Ctrl-b ,` rename — while true, `setPaneProgram`
   * below keeps `name` synced to whichever program the window's focused
   * pane is running; `renameWindowManual` flips this to false permanently
   * for that window. */
  autoName: boolean;
  root: PaneNode;
  /** Which pane (by id) is focused for keyboard delegation within this
   * window. Written by pane-focus navigation (`o`/arrow/`;`) below whenever
   * focus moves. */
  activePaneId: string;
  /** Prefix `;` (last-pane), the pane-focus twin of `Session.lastWindowIdx`.
   * The pane that was focused immediately before the CURRENT one; bookkept
   * by every op that reassigns `activePaneId` below. Undefined until the
   * window's focus has actually moved at least once (fresh window: nothing
   * to jump back to). */
  lastPaneId?: string | undefined;
  /** Every pane id currently in this window's tree, in CREATION order:
   * index 0 is the "main" pane for `main-horizontal`/`main-vertical`
   * layouts (documented tmux fidelity choice — real tmux uses the
   * first-created pane the same way), and a pane's live position in this
   * array is its `pane_index` for the `kill-pane {pane_index}? (y/n)`
   * prompt. Deliberately RENUMBERED on every kill (indices always `0..n-1`,
   * no gaps) rather than preserving each pane's original creation number;
   * layout application never reorders this array, only split/kill do. */
  paneOrder: string[];
  /** A monotonic per-window counter (never reused, never derived from
   * `paneOrder.length`) backing every new pane id this window ever creates
   * (`${windowId}#${paneSeq++}`), so a kill-then-split sequence can never
   * mint an id that collides with a pane still alive in the tree (deriving
   * the next index from `paneOrder.length` would do exactly that). Starts
   * at 1 — index 0 is always the window's original factory-seeded pane. */
  paneSeq: number;
  /** The last preset applied via `Ctrl-b Space`/`select-layout` (undefined =
   * "never applied one yet", the fidelity reference's "lastLayout = -1" —
   * the next bare Space starts the cycle at index 0, `even-horizontal`). A
   * manual split does NOT reset this — real tmux only tracks the last
   * APPLIED preset, a hand split just makes the window's actual geometry
   * diverge from it until Space (or `select-layout`) is used again. */
  lastLayout?: LayoutName;
}

export interface Session {
  id: string;
  name: string;
  windows: Window[];
  activeWindowIdx: number;
  /** The index of whichever window was active immediately before the
   * CURRENT one (real tmux's "last window", surfaced as the `-` flag on the
   * status line). Bookkept by every operation that changes
   * `activeWindowIdx` below; rendering the flag itself is done elsewhere —
   * this file only keeps the index correct. */
  lastWindowIdx: number;
  /** Frozen page-clock epoch (ms) this session was created at — `tmux ls`'s
   * "created {ctime}" column — never `Date.now()` read again after
   * creation (determinism rules). */
  createdAt: number;
  /** "Most recently used unattached session" (bare `tmux a`/`attach`, and
   * the kill-cascade's own "switch to the most recent remaining session"
   * fidelity rule) needs a RECENCY ordering across sessions. A logical
   * counter (`Client.attachSeq`, bumped by `attachSession` below), never a
   * frozen-clock epoch — under a pinned test clock every session's
   * `createdAt`/`Date.now()` read would collapse to the identical instant,
   * degrading "most recent" into "insertion order" and silently
   * miscomputing the pick (a `tmux new -s test` + detach + `tmux a`
   * sequence would otherwise reattach the DEFAULT session instead of
   * `test`). Sortable, deterministic under fixtures, no clock dependence.
   * `0` until a session has ever been attached (unreachable via `tmux a`'s
   * own candidate set in practice — every session that exists was created
   * via an attach-and-create flow — kept only so the field always has a
   * well-defined initial value). */
  lastAttachedSeq: number;
}

export interface Client {
  sessions: Session[];
  /** Null once detached — no session owns the keyboard; the host shell
   * (`Client.hostPane` below) does instead. */
  attachedSessionId: string | null;
  /** Monotonic counter backing `Session.lastAttachedSeq` above — bumped by
   * every `attachSession()` call (including the kill-cascade's own silent
   * switch-to-most-recent-remaining), never read directly by callers. */
  attachSeq: number;
  /** The detached HOST shell's own pane, deliberately modeled as a REAL
   * `Pane` (not a bare `ShellState`) living directly on the client rather
   * than inside any session/window: this is what lets
   * src/components/Shell.svelte mount it with its existing `pane: Pane`
   * prop contract unchanged (the exact same `pane.shell = {...}`
   * write-through Svelte reactivity every other pane already relies on).
   * `program` is always "shell" here (never read meaningfully; kept only
   * because `Pane` requires it). Survives detach/re-attach cycles within
   * the page's lifetime; `createFactoryClient()` (reboot) is the only thing
   * that resets it.
   */
  hostPane: Pane;
}

// ---------------------------------------------------------------------------
// Pane-tree helpers (written against the PaneNode union).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Pane-tree rewrite helpers — `splitPane`/`killPaneInWindow` below each walk
// the tree by paneId (never by object identity) and rebuild new objects
// back up to the root, structural-sharing every untouched subtree — see
// `insertSplit`'s own comment (further down, right beside `splitPane`) for
// the split-side rebuild.
// ---------------------------------------------------------------------------

/** Removes the leaf pane `paneId` from `node`, renormalizing its parent
 * split's `sizes` to still sum to ~1 over the remaining children, and
 * collapsing a split down to a bare node once it has only one child left
 * (real tmux: the sibling simply takes over the freed space — there is no
 * such thing as a 1-child split). Returns `null` when `node` itself WAS the
 * pane being removed (the caller's own window has no pane left — "kill the
 * last pane" cascades to kill-window, handled by the caller, never here). */
function removePaneNode(node: PaneNode, paneId: string): PaneNode | null {
  if (node.type === "leaf") return node.pane.id === paneId ? null : node;

  const idx = node.children.findIndex((c) => allPanes(c).some((p) => p.id === paneId));
  if (idx === -1) return node; // not under this subtree at all — defensive, unreachable in practice

  const rewritten = removePaneNode(node.children[idx], paneId);
  if (rewritten === null) {
    // The pane WAS the direct child at `idx` — drop it and its parallel size,
    // then renormalize the remaining shares to sum back to 1.
    const remainingChildren = node.children.filter((_, i) => i !== idx);
    const remainingSizesRaw = node.sizes.filter((_, i) => i !== idx);
    const total = remainingSizesRaw.reduce((a, b) => a + b, 0) || 1;
    const remainingSizes = remainingSizesRaw.map((s) => s / total);
    if (remainingChildren.length === 1) return remainingChildren[0]; // collapse — no 1-child splits
    return { ...node, children: remainingChildren, sizes: remainingSizes };
  }

  // The pane was deeper down — splice the rewritten subtree back in place,
  // this node's own children count/sizes are unaffected.
  const children = [...node.children];
  children[idx] = rewritten;
  return { ...node, children };
}

/** The window's currently-focused pane (`activePaneId`) — falls back to the
 * tree's first pane defensively (should never be needed in practice: nothing
 * ever sets `activePaneId` to a paneId absent from its own window's tree). */
export function focusedPane(window: Window): Pane {
  return findPaneById(window.root, window.activePaneId) ?? allPanes(window.root)[0];
}

// ---------------------------------------------------------------------------
// Pane focus / navigation (prefix `o`/arrows/`;`). Every one of these
// bookkeeps `lastPaneId` the same way
// `selectWindowIndex` bookkeeps `Session.lastWindowIdx` — a single shared
// primitive (`focusPane`) so that invariant has one home.
// ---------------------------------------------------------------------------

/** Moves focus to `paneId` — a no-op (no `lastPaneId` bookkeeping either) if
 * it's already the focused pane, or isn't part of this window at all. */
function focusPane(window: Window, paneId: string): void {
  if (paneId === window.activePaneId) return;
  if (!findPaneById(window.root, paneId)) return;
  window.lastPaneId = window.activePaneId;
  window.activePaneId = paneId;
}

/** Prefix `o` — next pane, cycling through `paneOrder` (creation order,
 * wrapping). A no-op on a single-pane window. */
export function cycleNextPane(window: Window): void {
  const order = window.paneOrder;
  if (order.length <= 1) return;
  const idx = order.indexOf(window.activePaneId);
  const nextIdx = (idx + 1) % order.length;
  focusPane(window, order[nextIdx]);
}

/** Prefix `;` — jumps back to whichever pane was focused immediately before
 * the current one (real tmux: pressing it again toggles back, since
 * `focusPane` above always records the pane being LEFT as the new
 * `lastPaneId`). A no-op if nothing to jump to yet, or that pane has since
 * been killed. */
export function focusLastPane(window: Window): void {
  const target = window.lastPaneId;
  if (!target) return;
  focusPane(window, target);
}

/** A pane's on-screen rect as FRACTIONS of the window's own content area
 * (0..1) — purely geometric, no pixels, no DOM: directional nav (below) only
 * ever needs relative position, and this is exactly the fraction
 * PaneTree.svelte's flex rendering itself uses for `sizes`. */
export interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Walks the tree accumulating each leaf's rect — a split's `direction`
 * determines which axis its `sizes` subdivide (row = x/width, column =
 * y/height); every other axis is inherited unchanged from the parent. */
export function computePaneRects(node: PaneNode, rect: PaneRect = { x: 0, y: 0, w: 1, h: 1 }, out: Map<string, PaneRect> = new Map()): Map<string, PaneRect> {
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

/** Geometric directional pick — picks the nearest pane in `dir` from the
 * focused pane's rect: among every OTHER pane whose
 * CENTER lies strictly in `dir` from the focused pane's center, picks the
 * one with the smallest distance along the primary axis (x for left/right,
 * y for up/down), tie-breaking on the perpendicular (secondary) axis — the
 * usual tmux-ish "closest in a row/column, then closest across" heuristic.
 *
 * A pure center-distance comparison alone misreads one common shape,
 * though: a pane spanning the FULL opposite axis (e.g. a `main-vertical`
 * layout's main pane, full-height on the left) sits roughly equidistant
 * from every pane in the column on the right, and its center can end up
 * VERTICALLY closer to one of them than that column's own neighbor is —
 * center-distance alone would then wrongly hop across columns for an
 * up/down move instead of staying within the column tmux visually put you
 * in. Fixed by preferring candidates whose rect actually OVERLAPS the
 * focused pane's rect on the perpendicular axis (the two panes share some
 * horizontal range for an up/down move, or vertical range for left/right —
 * i.e. they're plausibly "in the same row/column"). No fallback to a
 * non-overlapping candidate when none overlap: a pane spanning the FULL
 * perpendicular axis (main-vertical's main pane again) genuinely has no
 * neighbor "up"/"down" from it (it already occupies the whole column) —
 * real tmux does nothing there, which this matches by returning `undefined`
 * rather than guessing a wrong-axis hop.
 *
 * `undefined` when nothing qualifies at all (e.g. the focused pane is
 * already the rightmost one, or has no overlapping neighbor that way) — the
 * caller no-ops, matching real tmux's own silent refusal to move. */
export function findDirectionalPane(rects: Map<string, PaneRect>, fromId: string, dir: PaneDirection): string | undefined {
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
    if (!best || c.primary < best.primary - EPS || (Math.abs(c.primary - best.primary) <= EPS && c.secondary < best.secondary)) {
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

// ---------------------------------------------------------------------------
// Session/client lookup helpers
// ---------------------------------------------------------------------------

export function activeSessionOf(client: Client): Session | undefined {
  if (client.attachedSessionId === null) return undefined;
  return client.sessions.find((s) => s.id === client.attachedSessionId);
}

export function activeWindowOf(session: Session): Window {
  return session.windows[session.activeWindowIdx];
}

// ---------------------------------------------------------------------------
// Window selection / cycling
// ---------------------------------------------------------------------------

/** Selects `index` directly (status-bar click, digit prefix targets,
 * `select-window`). A no-op — including no `lastWindowIdx` bookkeeping — when
 * `index` is out of range or already active, exactly like real tmux
 * selecting the window it's already on. */
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

// ---------------------------------------------------------------------------
// Rename / kill
// ---------------------------------------------------------------------------

/** `Ctrl-b ,` commit — disables auto-rename for this window permanently (see
 * `Window.autoName`'s own comment). A no-op if `windowId` doesn't exist. */
export function renameWindowManual(session: Session, windowId: string, name: string): void {
  const win = session.windows.find((w) => w.id === windowId);
  if (!win) return;
  win.name = name;
  win.autoName = false;
}

export type KillWindowResult = { ok: true } | { ok: false; reason: "only-window" };

/**
 * `Ctrl-b &` / `:kill-window` — refuses (no mutation at all) when this is the
 * session's last window, matching today's exact behavior (site.yaml's
 * `killLastWindowMessage`, rendered by the caller). Otherwise removes the
 * window; if it was the active one, falls back to whichever window now sits
 * at its old array position (`remaining[idx] ?? remaining[0]` — the window
 * that sat right after it, or wraps to the first remaining window if
 * it was last) so the "kill every window down to the
 * last one" e2e sequence produces byte-identical results.
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

  // Defensive clamp — every branch above should already leave both indices
  // valid; this just guarantees the "fully consistent at return" invariant
  // holds even if a future edge case slips through the branches above.
  if (session.activeWindowIdx >= session.windows.length) {
    session.activeWindowIdx = Math.max(0, session.windows.length - 1);
  }
  if (session.lastWindowIdx >= session.windows.length) {
    session.lastWindowIdx = session.activeWindowIdx;
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Splits (`Ctrl-b |`/`%` and `-`/`"`)
// ---------------------------------------------------------------------------

/** `|`/`%` (row — side by side) or `-`/`"` (column — stacked): real tmux's
 * own rule is "insert as a sibling if the target pane's immediate parent
 * split is already the same orientation, otherwise wrap the target pane in
 * a brand new split of the requested orientation" — walks `node` looking for
 * `targetPaneId` and applies exactly that rule the moment it's found,
 * rebuilding new objects back up to the root (functional, no in-place
 * mutation — same convention `removePaneNode` above uses). */
function insertSplit(node: PaneNode, targetPaneId: string, direction: "row" | "column", newLeaf: PaneLeaf): PaneNode {
  if (node.type === "leaf") {
    if (node.pane.id !== targetPaneId) return node;
    return { type: "split", direction, children: [node, newLeaf], sizes: [0.5, 0.5] };
  }

  const idx = node.children.findIndex((c) => allPanes(c).some((p) => p.id === targetPaneId));
  if (idx === -1) return node; // not under this subtree — defensive, unreachable in practice

  const child = node.children[idx];
  if (child.type === "leaf" && child.pane.id === targetPaneId && node.direction === direction) {
    // Same-orientation parent, target is a DIRECT child — insert the new
    // pane as an adjacent sibling, halving the target's own share (every
    // OTHER sibling's share is untouched — splitting one pane never resizes
    // panes it isn't adjacent to, exactly like real tmux).
    const oldSize = node.sizes[idx];
    const half = oldSize / 2;
    const children = [...node.children];
    const sizes = [...node.sizes];
    children.splice(idx + 1, 0, newLeaf);
    sizes.splice(idx + 1, 0, half);
    sizes[idx] = half;
    return { ...node, children, sizes };
  }

  // Either the target is deeper down, or it's a direct child but the parent
  // split's orientation doesn't match — recursing into a leaf child hits the
  // top branch above, wrapping just that leaf in a brand-new split of the
  // requested direction, which this call then splices back in place.
  const rewrittenChild = insertSplit(child, targetPaneId, direction, newLeaf);
  const children = [...node.children];
  children[idx] = rewrittenChild;
  return { ...node, children };
}

/** `Ctrl-b |`/`%` (direction "row") and `Ctrl-b -`/`"` (direction "column")
 * — splits the window's own FOCUSED pane, always 50/50 with a brand-new
 * SHELL pane, which becomes the newly focused pane. A no-op if the window's
 * `activePaneId` has somehow gone
 * stale (defensive — should be unreachable). */
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

// ---------------------------------------------------------------------------
// Kill-pane
// ---------------------------------------------------------------------------

/** A pane's stable, LIVE-renumbered position within its window (0-based,
 * `Window.paneOrder`'s own creation-order list) — the `{pane_index}` in the
 * `kill-pane {pane_index}? (y/n)` confirm prompt. `-1` if `paneId` isn't in
 * this window at all (defensive). */
export function paneIndexInWindow(window: Window, paneId: string): number {
  return window.paneOrder.indexOf(paneId);
}

export type KillPaneResult = { kind: "pane-removed" } | { kind: "last-pane" };

/** Removes `paneId` from `window`'s tree (`Ctrl-b x` ALWAYS prompts
 * kill-pane, even on a single-pane window — the caller is the one that
 * decides what "the last pane" cascades to, this function only
 * ever handles the "more than one pane" case and reports back when it
 * wasn't). Collapsing a split down to its last remaining child, and
 * renormalizing sibling `sizes`, are handled by `removePaneNode` itself.
 * Moves focus (if the killed pane was focused) to whichever pane sat right
 * BEFORE it in creation order, wrapping to the new first pane if it was
 * itself first — a pane-scoped mirror of `killWindow`'s own "fall back to
 * whichever now sits at its old position" convention. */
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

// ---------------------------------------------------------------------------
// Layout engine (the 7 tmux presets and `Ctrl-b Space` / `select-layout`)
// ---------------------------------------------------------------------------

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

/** The "big main pane" fraction for `main-horizontal(-mirrored)`/
 * `main-vertical(-mirrored)` — the main pane plus others along the opposite
 * edge. Real tmux sizes its main pane with an ABSOLUTE
 * `main-pane-height`/`main-pane-width` (a fixed row/column count), not a
 * percentage, so there is no single "exact" fraction to port — 60/40 is a
 * deliberate choice that keeps the main pane visibly bigger than the rest
 * without claiming false precision. */
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

/** Pure tree-builder for all 7 presets — takes `panes` in the window's
 * STABLE `paneOrder` (creation order; index 0 is the "main" pane for the two
 * main-* families, a documented tmux-fidelity choice — see `Window.
 * paneOrder`'s own comment) and returns a BRAND NEW root, discarding
 * whatever the window's tree shape was before (real tmux: applying a preset
 * always rebuilds the whole layout from scratch, it doesn't try to preserve
 * a manually-split arrangement). A single pane is always just a bare leaf —
 * nothing to arrange. */
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
      // Near-even grid: cols = ceil(sqrt(n)), rows = ceil(n/cols) — matches
      // real tmux's own tiled arrangement for every count this phase tests
      // (2-5 panes). Any short final row simply has fewer, evenly-widened
      // columns (its own row-split only has as many children as it has
      // panes) — real tmux's own behavior for a non-perfect grid. When
      // every pane fits in a SINGLE row (cols >= n, e.g. n=2 → cols=2), the
      // grid degenerates to a plain row — returned directly rather than
      // wrapped in a column split with only one child (this file's own "no
      // 1-child splits" invariant, see `removePaneNode`'s comment).
      const n = panes.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rowsOfPanes: Pane[][] = [];
      for (let i = 0; i < n; i += cols) rowsOfPanes.push(panes.slice(i, i + cols));
      // Same "no 1-child splits" rule applies PER ROW: a short final row of
      // exactly one pane is that pane's bare leaf, not a 1-child row split.
      const rowNodes = rowsOfPanes.map((rowPanes) =>
        rowPanes.length === 1 ? leafOf(rowPanes[0]) : rowOf(rowPanes.map(leafOf), evenSizes(rowPanes.length)),
      );
      if (rowNodes.length === 1) return rowNodes[0];
      return columnOf(rowNodes, evenSizes(rowNodes.length));
    }
  }
}

/** `select-layout <name>` (named form) — applies `layoutName` to `window`
 * RIGHT NOW, rebuilding its tree from the current `paneOrder`, and records
 * it as `lastLayout` so a FOLLOWING bare `Ctrl-b Space`/`select-layout`
 * continues the cycle/reapplication from here (the named form and the cycle
 * share one piece of state). A no-op if the window somehow has
 * no panes at all (defensive, unreachable — every window always has ≥1). */
export function applyLayout(window: Window, layoutName: LayoutName): void {
  const panes = window.paneOrder.map((id) => findPaneById(window.root, id)).filter((p): p is Pane => !!p);
  if (panes.length === 0) return;
  window.root = buildLayoutTree(panes, layoutName);
  window.lastLayout = layoutName;
}

/** `Ctrl-b Space` — applies the NEXT preset in the fidelity-verified cycle,
 * wrapping around, starting at index 0 (`even-horizontal`) the first time
 * it's ever pressed on a window (`lastLayout` unset — the fidelity
 * reference's "lastLayout = -1" rule). */
export function nextLayout(window: Window): void {
  const currentIdx = window.lastLayout ? LAYOUT_NAMES.indexOf(window.lastLayout) : -1;
  const next = LAYOUT_NAMES[(currentIdx + 1) % LAYOUT_NAMES.length];
  applyLayout(window, next);
}

/** Bare `select-layout` (no name) — reapplies whatever preset was last
 * applied, recomputed fresh against the CURRENT pane list (e.g. after a
 * manual split diverged the tree from it — real tmux fidelity: `select-
 * layout` with no argument means "reapply the current layout"); a silent
 * no-op if no preset has ever been applied to this window. */
export function reapplyLastLayout(window: Window): void {
  if (!window.lastLayout) return;
  applyLayout(window, window.lastLayout);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Bare `tmux a`/`attach` (no `-t`) fidelity rule: "most recently used
 * unattached session" — the highest `lastAttachedSeq` among `sessions`.
 * `undefined` for an empty list (`no sessions`, rendered by the caller). */
function pickMostRecentSession(sessions: Session[]): Session | undefined {
  return [...sessions].sort((a, b) => b.lastAttachedSeq - a.lastAttachedSeq)[0];
}

/** Attaches the client to an EXISTING session by id (a no-op if `sessionId`
 * doesn't exist) — bumps the recency counter so this session becomes the new
 * "most recently used" for the next bare `tmux a`. Used by both a resolved
 * `tmux a [-t name]` and the immediate attach half of `tmux new [-s name]`
 * (real tmux: starting a brand-new session from outside BOTH creates and
 * attaches). */
export function attachSession(client: Client, sessionId: string): void {
  const session = client.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  client.attachedSessionId = sessionId;
  client.attachSeq += 1;
  session.lastAttachedSeq = client.attachSeq;
}

/** `Ctrl-b d` — no session owns the keyboard
 * afterward; the caller (Terminal.svelte) is the one that appends the
 * `[detached (from session {name})]` line to `Client.hostPane`'s own shell
 * buffer (this file stays free of shell.yaml string content). */
export function detachClient(client: Client): void {
  client.attachedSessionId = null;
}

/** `tmux new [-s name]` (host mode only — a pane shell always refuses
 * before reaching this) — creates a
 * brand-new session with exactly one window (`0:zsh`, auto-named, running a
 * shell — real tmux's own behavior for a session nobody has launched a
 * program in yet). Does NOT attach on its own; the caller pairs this with
 * `attachSession()` immediately after, matching real tmux's combined
 * create-and-attach. `name` must already be validated (non-duplicate) by
 * the caller (src/lib/shell.ts's own `runCommand` — duplicate-name
 * rejection needs the exact `duplicate session: {name}` string, which lives
 * in shell.yaml, not here). */
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

/** `Ctrl-b c` — tmux new-window: appends a
 * brand-new, auto-named `zsh` window running the in-window shell program to
 * `session`, numbered one past the highest window number currently in the
 * session (so it always coexists with whatever fixed digit targets a given
 * caller has bound — the site's own six seed windows are numbered 0-5, so a
 * fresh window here always lands at 6+ without colliding). Deliberately
 * does NOT touch `activeWindowIdx`/`lastWindowIdx` itself — same "create,
 * caller activates" split `createSession`/`attachSession` already use above
 * — so the one function that owns that invariant (`selectWindowIndex`) is
 * still the only place it's bookkept; the caller pairs this with
 * `selectWindowIndex(session, session.windows.length - 1)` immediately
 * after, matching real tmux's own "new window is created AND focused" combo
 * the same way `tmux new -s name` is create-and-attach. Window ids stay
 * deterministic (never a module-level counter or `Math.random()`,
 * determinism rules) — a number can be reused after its window is killed
 * and a new one created (the old window's state is fully gone by then), so
 * `${session.id}#w${number}` never collides with anything still alive. */
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
  /** `detachedToHost: true` — no sessions remain; the client is now fully
   * detached (`[exited]`, rendered by the caller). `false` — another session
   * still existed, and the client was silently switched to the most
   * recently used one (shows nothing special to the user). */
  | { kind: "session-destroyed"; detachedToHost: boolean };

/** Shared tail of "a session is being destroyed outright" — removes it from
 * `client.sessions`, and, ONLY if it was the attached one, either switches
 * silently to the most-recently-used REMAINING session or, if none remain,
 * detaches the client entirely (`[exited]`, rendered by the caller). Used by
 * both `killWindowCascade` (killing a session's last window) and
 * `killSession` (choose-tree `x` on a session row) — the exact same
 * "session is gone" bookkeeping either way, just reached from two
 * different triggers. */
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
 * `Ctrl-b &` / `:kill-window` / shell `exit` in the LAST pane of a window —
 * unlike the plain `killWindow()` above (which refuses to kill a session's
 * only window), this cascades. Killing a window that ISN'T the session's
 * last one still just removes it (delegates to `killWindow`, which never
 * refuses when `windows.length > 1`). Killing the session's LAST window destroys the
 * session outright (real tmux: killing the last window kills the session);
 * if the destroyed session was the attached one, the client either switches
 * silently to the most-recently-used REMAINING session, or, if none remain,
 * detaches to the host shell (`[exited]`).
 */
export function killWindowCascade(client: Client, session: Session, windowId: string): KillWindowCascadeResult {
  if (session.windows.length <= 1) {
    const { detachedToHost } = destroySession(client, session.id);
    return { kind: "session-destroyed", detachedToHost };
  }
  killWindow(session, windowId);
  return { kind: "window-removed" };
}

/** choose-tree `x` on a SESSION row — kills every window in `sessionId` at
 * once, i.e. the whole session, in one step (unlike `killWindowCascade`,
 * which only ever destroys a session as a SIDE EFFECT of its last window
 * dying). The TYPED `kill-session` cmdline/tmux command is excluded from
 * this site; only this overlay action reaches it. Reuses the exact same
 * "destroy a session" bookkeeping `killWindowCascade` falls back to. */
export function killSession(client: Client, sessionId: string): { kind: "session-destroyed"; detachedToHost: boolean } {
  const { detachedToHost } = destroySession(client, sessionId);
  return { kind: "session-destroyed", detachedToHost };
}

// ---------------------------------------------------------------------------
// Program launch/exit
// ---------------------------------------------------------------------------

/** A window's auto-rename text for a given program — every program's own
 * name verbatim, except the in-window shell, which is real tmux's own
 * `zsh`. */
export function programDisplayName(program: ProgramName): string {
  return program === "shell" ? "zsh" : program;
}

/** Sets `paneId`'s running program and, if its window hasn't been manually
 * renamed, updates the window's auto-rename text to match. The shared
 * plumbing under both `launchProgram` and
 * `exitProgram` below — single source of the auto-rename bookkeeping. A
 * no-op if `paneId` doesn't exist in this session. */
export function setPaneProgram(session: Session, paneId: string, program: ProgramName): void {
  const win = windowOfPane(session, paneId);
  if (!win) return;
  const pane = findPaneById(win.root, paneId);
  if (!pane) return;
  pane.program = program;
  if (win.autoName) win.name = programDisplayName(program);
}

/** Launches `program` in `paneId` — any pane can launch any program, even
 * one already running elsewhere; typing a
 * program's bare name into an in-window shell, or relaunching one from
 * Cmdline/HelpSearch/dashboard menu, all funnel through this one function. */
export function launchProgram(session: Session, paneId: string, program: ProgramName): void {
  setPaneProgram(session, paneId, program);
}

/** `:q` / cmdline `q` — drops `paneId`'s program back to an in-window
 * shell. Idempotent: exiting an already-shell pane just re-sets the same
 * program (harmless). */
export function exitProgram(session: Session, paneId: string): void {
  setPaneProgram(session, paneId, "shell");
}

// ---------------------------------------------------------------------------
// Factory ("reboot = factory state")
// ---------------------------------------------------------------------------

export interface WindowSeed {
  id: string;
  number: number;
  name: string;
}

export interface FactoryOptions {
  /** Bare session name (e.g. "10.42.7.13") — NOT the status bar's own
   * "Session: {name}" display string (that formatting stays in site.yaml /
   * StatusBar.svelte; this file only ever holds the bare name). */
  sessionName: string;
  /** Seed window list — site.yaml's `statusBar.windows`, content-driven (no
   * window names hardcoded in this file). Every seed's `id` MUST be a valid
   * `ProgramName` (site.yaml's six window ids already are: dashboard/repositories/
   * employment/retina-v/profile/help) — that id doubles as the window's
   * initial program AND its permanent identity: a window's identity never
   * changes even once its pane runs some other program or a shell. */
  windows: WindowSeed[];
  /** Frozen page-clock epoch (src/lib/clock.ts's `resolvePageEpoch()`) —
   * this file never calls `Date.now()` itself (determinism rules). */
  epoch: number;
  /** Which window is active on creation — defaults to the first seed
   * (index 0) when omitted or not found. Terminal.svelte passes the route
   * the page was SSR'd with here so the very first client build doesn't
   * need a follow-up `selectWindowIndex` call (and the pushState that would
   * imply) just to reach the window matching `initialView`. */
  activeWindowId?: string;
  sessionId?: string;
  /** The detached host shell's pre-seeded scrollback (shell.ts's
   * `seedHostNarrative()`, itself sourced from shell.yaml's
   * `host.narrative` rows — content-driven, this file
   * only ever holds whatever `ShellLine[]` the caller hands it). Defaults to
   * empty so every existing unit test's `createFactoryClient()` call (none
   * of which pass this) keeps working unchanged. */
  hostNarrative?: ShellLine[];
}

function makePane(windowId: string, index: number, program: ProgramName): Pane {
  // Deterministic id — a pure function of (windowId, index), never a
  // module-level counter or Math.random() (determinism rules): a factory
  // rebuild (reboot) always reproduces the exact same ids for the exact same
  // tree shape.
  return { id: `${windowId}#${index}`, program, shell: createShellState() };
}

/** Builds a fresh, single-session client — the site's initial mount AND
 * every `reboot()` (reusable for both since it takes no hidden state). */
export function createFactoryClient(opts: FactoryOptions): Client {
  const sessionId = opts.sessionId ?? "session-0";

  const windows: Window[] = opts.windows.map((seed) => {
    const program = seed.id as ProgramName;
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
    // Attached immediately at creation — the one and only session this
    // factory build knows about is, by construction, the "most recently
    // used" one (matters the moment a second session is created via `tmux
    // new` and later killed, at which point the cascade needs to pick
    // between this one and that one).
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
