// tmux client/session/window/pane model (PLAN.md Iteration 3 Phase 4 item
// 4.1) — 100% pure, no DOM, no Svelte imports, unit-testable exactly like
// src/lib/vim.ts/boot.ts. Terminal.svelte owns exactly one `$state` `Client`
// object and calls into the operations below to mutate it; every operation
// mutates its argument(s) in place and leaves the client fully consistent at
// return (no intermediate state where e.g. `windows` has shrunk but
// `activeWindowIdx`/`lastWindowIdx` still point past the end) — that
// in-place mutation works identically whether the object passed in is a
// plain object (unit tests) or a Svelte 5 `$state` proxy (Terminal.svelte).
//
// Deliberately designed so Phases 5-6 extend this file WITHOUT reworking
// Phase 4's shape (PLAN.md "Architecture notes for executors"):
//   - `Client.sessions` is already an array and `attachedSessionId` already
//     nullable, even though Phase 4 only ever has exactly one session and is
//     always attached to it — Phase 5 adds create/attach/detach/list without
//     touching this shape.
//   - `PaneNode` is already a discriminated union (today only the "leaf"
//     variant exists) and every pane-lookup helper below (`allPanes`,
//     `findPaneById`, `windowOfPane`) is written against the union rather
//     than assuming a single leaf — Phase 6 adds a "split" variant and only
//     those three helpers need a second arm, nothing else in this file or in
//     Terminal.svelte's call sites changes shape.
//   - `Window.activePaneId` already exists (today it's always the window's
//     one leaf pane's id) so Phase 6's pane-focus-navigation has somewhere to
//     write.
//   - Pane ids are a deterministic function of (windowId, index) — never a
//     module-level counter or `Math.random()` — so a `reboot()` factory
//     rebuild is byte-for-byte reproducible and every id is stable within a
//     given tree shape (PLAN.md Phase 4 determinism rules).

import { createShellState, type ShellLine, type ShellState } from "./shell.ts";

/** A pane's currently-running program. "shell" is the in-window shell a
 * program's `:q` drops back to (PLAN.md Locked decision #2) — every OTHER
 * value is one of the site's six view components, reused verbatim as the
 * window's own auto-rename text (see `programDisplayName` below). */
export type ProgramName = "dashboard" | "builds" | "personnel" | "profile" | "retina-v" | "help" | "shell";

export interface Pane {
  id: string;
  program: ProgramName;
  /** PLAN.md Iteration 3 Phase 4 item 4.2 — every pane carries its OWN
   * shell buffer from creation, not just once it becomes a shell: any pane
   * can `:q` its program away and back (Locked decision #5), and the
   * buffer must survive that round-trip (and switching away from/back to
   * the window entirely) exactly like a real tmux pane's scrollback — only
   * `reboot()`/a page reload resets it (advisor guidance, PLAN.md
   * Architecture notes). Lives here (not component-local Svelte state) for
   * exactly that reason. */
  shell: ShellState;
}

export interface PaneLeaf {
  type: "leaf";
  pane: Pane;
}

/** Phase 6 adds a `{ type: "split"; direction; children: PaneNode[] }`
 * variant here for real splits/layouts. Every function below that walks a
 * `PaneNode` is already written as a small exhaustive-by-`type` helper
 * (`allPanes`/`findPaneById`) so adding that variant only means adding one
 * more arm to each of those two functions — no other code in this file, nor
 * any of its call sites, assumes "leaf" is the only shape. */
export type PaneNode = PaneLeaf;

export interface Window {
  id: string;
  number: number;
  name: string;
  /** True until a manual `Ctrl-b ,` rename (PLAN.md tmux fidelity reference
   * "Window auto-rename") — while true, `setPaneProgram` below keeps `name`
   * synced to whichever program the window's focused pane is running;
   * `renameWindowManual` flips this to false permanently for that window. */
  autoName: boolean;
  root: PaneNode;
  /** Which pane (by id) is focused for keyboard delegation within this
   * window. Phase 4: always the window's one leaf pane's id, set once at
   * creation and never reassigned (no pane-focus-navigation exists yet).
   * Phase 6's `o`/arrow/`;` pane nav writes here. */
  activePaneId: string;
}

export interface Session {
  id: string;
  name: string;
  windows: Window[];
  activeWindowIdx: number;
  /** The index of whichever window was active immediately before the
   * CURRENT one (real tmux's "last window", surfaced as the `-` flag on the
   * status line — PLAN.md tmux fidelity reference). Bookkept by every
   * operation that changes `activeWindowIdx` below; rendering the flag
   * itself is a later step (PLAN.md Phase 4 item 4.3), this file only keeps
   * the index correct. */
  lastWindowIdx: number;
  /** Frozen page-clock epoch (ms) this session was created at — `tmux ls`'s
   * "created {ctime}" column (PLAN.md tmux fidelity reference), never
   * `Date.now()` read again after creation (determinism rules). */
  createdAt: number;
  /** PLAN.md Iteration 3 Phase 5 item 5.2 — "most recently used unattached
   * session" (bare `tmux a`/`attach`, and the kill-cascade's own "switch to
   * the most recent remaining session" fidelity rule) needs a RECENCY
   * ordering across sessions. A logical counter (`Client.attachSeq`, bumped
   * by `attachSession` below), never a frozen-clock epoch — under a pinned
   * test clock every session's `createdAt`/`Date.now()` read would collapse
   * to the identical instant, degrading "most recent" into "insertion
   * order" and silently miscomputing the pick (advisor-caught: a `tmux new
   * -s test` + detach + `tmux a` sequence would otherwise reattach the
   * DEFAULT session instead of `test`). Sortable, deterministic under
   * fixtures, no clock dependence. `0` until a session has ever been
   * attached (unreachable via `tmux a`'s own candidate set in practice —
   * every session that exists was created via an attach-and-create flow —
   * kept only so the field always has a well-defined initial value). */
  lastAttachedSeq: number;
}

export interface Client {
  sessions: Session[];
  /** Null once detached (PLAN.md Iteration 3 Phase 5 item 5.1) — no session
   * owns the keyboard; the host shell (`Client.hostPane` below) does
   * instead. Phase 4 was always attached to exactly one session; Phase 5
   * makes this legitimately nullable. */
  attachedSessionId: string | null;
  /** Monotonic counter backing `Session.lastAttachedSeq` above — bumped by
   * every `attachSession()` call (including the kill-cascade's own silent
   * switch-to-most-recent-remaining), never read directly by callers. */
  attachSeq: number;
  /** PLAN.md Iteration 3 Phase 5 item 5.1 — the detached HOST shell's own
   * pane, deliberately modeled as a REAL `Pane` (not a bare `ShellState`)
   * living directly on the client rather than inside any session/window:
   * this is what lets src/components/Shell.svelte mount it with its
   * existing `pane: Pane` prop contract completely unchanged (the exact
   * same `pane.shell = {...}` write-through Svelte reactivity every other
   * pane already relies on) — no new component-level plumbing needed for
   * Phase 5 to reuse Phase 4's Shell.svelte verbatim. `program` is always
   * "shell" here (never read meaningfully; kept only because `Pane` requires
   * it). Survives detach/re-attach cycles within the page's lifetime;
   * `createFactoryClient()` (reboot) is the only thing that resets it.
   */
  hostPane: Pane;
}

// ---------------------------------------------------------------------------
// Pane-tree helpers (written against the PaneNode union — see its own
// comment on why Phase 6's split variant only touches these two functions).
// ---------------------------------------------------------------------------

/** Every pane reachable from `node`, in tree order. Phase 4: exactly one. */
export function allPanes(node: PaneNode): Pane[] {
  if (node.type === "leaf") return [node.pane];
  return [];
}

export function findPaneById(node: PaneNode, paneId: string): Pane | undefined {
  if (node.type === "leaf") return node.pane.id === paneId ? node.pane : undefined;
  return undefined;
}

function windowOfPane(session: Session, paneId: string): Window | undefined {
  return session.windows.find((w) => allPanes(w.root).some((p) => p.id === paneId));
}

/** The window's currently-focused pane (`activePaneId`) — falls back to the
 * tree's first pane defensively (should never be needed in practice: nothing
 * ever sets `activePaneId` to a paneId absent from its own window's tree). */
export function focusedPane(window: Window): Pane {
  return findPaneById(window.root, window.activePaneId) ?? allPanes(window.root)[0];
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
 * that used to sit right after it, or wraps to the first remaining window if
 * it was last) — literally the same formula Terminal.svelte's pre-Phase-4
 * `killWindow()` used, ported verbatim so the "kill every window down to the
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
// Sessions (PLAN.md Iteration 3 Phase 5 items 5.1/5.2/5.3)
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

/** `Ctrl-b d` (PLAN.md Locked decision #3) — no session owns the keyboard
 * afterward; the caller (Terminal.svelte) is the one that appends the
 * `[detached (from session {name})]` line to `Client.hostPane`'s own shell
 * buffer (this file stays free of shell.yaml string content). */
export function detachClient(client: Client): void {
  client.attachedSessionId = null;
}

/** `tmux new [-s name]` (host mode only — a pane shell always refuses
 * before reaching this, PLAN.md tmux fidelity reference) — creates a
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

export type KillWindowCascadeResult =
  | { kind: "window-removed" }
  /** `detachedToHost: true` — no sessions remain; the client is now fully
   * detached (`[exited]`, rendered by the caller). `false` — another session
   * still existed, and the client was silently switched to the most
   * recently used one (PLAN.md item 5.3: "show nothing special"). */
  | { kind: "session-destroyed"; detachedToHost: boolean };

/**
 * `Ctrl-b &` / `:kill-window` / shell `exit` in the LAST pane of a window,
 * routed through here instead of the plain `killWindow()` above once
 * sessions exist (PLAN.md Iteration 3 Phase 5 item 5.3 — this SUPERSEDES
 * Phase 4's "refuse to kill the only window" behavior, which was a
 * placeholder for a world where no other session could ever exist to fall
 * back to). Killing a window that ISN'T the session's last one still just
 * removes it (delegates to `killWindow`, which never refuses when
 * `windows.length > 1`). Killing the session's LAST window destroys the
 * session outright (real tmux: killing the last window kills the session);
 * if the destroyed session was the attached one, the client either switches
 * silently to the most-recently-used REMAINING session, or, if none remain,
 * detaches to the host shell (`[exited]`).
 */
export function killWindowCascade(client: Client, session: Session, windowId: string): KillWindowCascadeResult {
  if (session.windows.length <= 1) {
    client.sessions = client.sessions.filter((s) => s.id !== session.id);
    if (client.attachedSessionId !== session.id) {
      return { kind: "session-destroyed", detachedToHost: false };
    }
    const next = pickMostRecentSession(client.sessions);
    if (!next) {
      client.attachedSessionId = null;
      return { kind: "session-destroyed", detachedToHost: true };
    }
    client.attachedSessionId = next.id;
    client.attachSeq += 1;
    next.lastAttachedSeq = client.attachSeq;
    return { kind: "session-destroyed", detachedToHost: false };
  }
  killWindow(session, windowId);
  return { kind: "window-removed" };
}

// ---------------------------------------------------------------------------
// Program launch/exit (PLAN.md Locked decision #2 / #5)
// ---------------------------------------------------------------------------

/** A window's auto-rename text for a given program — every program's own
 * name verbatim, except the in-window shell, which is real tmux's own `zsh`
 * (PLAN.md tmux fidelity reference "Window auto-rename"). */
export function programDisplayName(program: ProgramName): string {
  return program === "shell" ? "zsh" : program;
}

/** Sets `paneId`'s running program and, if its window hasn't been manually
 * renamed, updates the window's auto-rename text to match (PLAN.md tmux
 * fidelity reference). The shared plumbing under both `launchProgram` and
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
 * one already running elsewhere (PLAN.md Locked decision #5); typing a
 * program's bare name into an in-window shell, or relaunching one from
 * Cmdline/HelpSearch/dashboard menu, all funnel through this one function. */
export function launchProgram(session: Session, paneId: string, program: ProgramName): void {
  setPaneProgram(session, paneId, program);
}

/** `:q` / cmdline `q` (PLAN.md Locked decision #2) — drops `paneId`'s
 * program back to an in-window shell. Idempotent: exiting an already-shell
 * pane just re-sets the same program (harmless). */
export function exitProgram(session: Session, paneId: string): void {
  setPaneProgram(session, paneId, "shell");
}

// ---------------------------------------------------------------------------
// Factory (PLAN.md Locked decision #1 / #6 — "reboot = factory state")
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
   * `ProgramName` (site.yaml's six window ids already are: dashboard/builds/
   * personnel/retina-v/profile/help) — that id doubles as the window's
   * initial program AND its permanent identity (PLAN.md Locked decision #5:
   * a window's identity never changes even once its pane runs some other
   * program or a shell). */
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
  /** PLAN.md Iteration 3 Phase 5 item 5.1 — the detached host shell's
   * pre-seeded scrollback (shell.ts's `seedHostNarrative()`, itself sourced
   * from shell.yaml's `host.narrative` rows — content-driven, this file
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
 * every `reboot()` (PLAN.md Phase 4 item 4.4 wires the latter; this function
 * itself is already reusable for both since it takes no hidden state). */
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
