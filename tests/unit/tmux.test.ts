// Unit tests for the tmux client/session/window/pane model (PLAN.md
// Iteration 3 Phase 4 item 4.1) — src/lib/tmux.ts. No DOM, no Svelte state:
// every operation is exercised directly against plain-object Session/Client
// values (the same shape Terminal.svelte's `$state` proxy wraps at runtime —
// this file proves the operations themselves are correct independent of
// that wrapping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createShellState } from "../../src/lib/shell.ts";
import {
  activeSessionOf,
  activeWindowOf,
  allPanes,
  applyLayout,
  attachSession,
  buildLayoutTree,
  computePaneRects,
  createFactoryClient,
  createSession,
  cycleNextPane,
  cycleWindow,
  detachClient,
  exitProgram,
  findDirectionalPane,
  findPaneById,
  focusDirectional,
  focusedPane,
  focusLastPane,
  isLayoutName,
  killPaneInWindow,
  killSession,
  killWindow,
  killWindowCascade,
  launchProgram,
  LAYOUT_NAMES,
  nextLayout,
  paneIndexInWindow,
  programDisplayName,
  reapplyLastLayout,
  renameWindowManual,
  selectWindowIndex,
  setPaneProgram,
  splitPane,
  type Client,
  type LayoutName,
  type Pane,
  type Session,
  type Window,
  type WindowSeed,
} from "../../src/lib/tmux.ts";

const SIX_WINDOWS: WindowSeed[] = [
  { number: 0, id: "dashboard", name: "dashboard" },
  { number: 1, id: "builds", name: "builds" },
  { number: 2, id: "personnel", name: "personnel" },
  { number: 3, id: "retina-v", name: "retina-v" },
  { number: 4, id: "profile", name: "profile" },
  { number: 5, id: "help", name: "help" },
];

function freshClient(): Client {
  return createFactoryClient({ sessionName: "10.42.7.13", windows: SIX_WINDOWS, epoch: 1_723_000_000_000 });
}

function freshSession(): Session {
  return activeSessionOf(freshClient())!;
}

function freshWindow(): Window {
  return activeWindowOf(freshSession());
}

/** Splits `window`'s CURRENT focused pane `n` times in `direction`,
 * returning the sizes of the parent split's own `children` array so a test
 * can assert the arithmetic without hand-deriving it — every call splits
 * whatever is focused NOW, matching a real `Ctrl-b |` pressed repeatedly. */
function splitTimes(window: Window, direction: "row" | "column", n: number): void {
  for (let i = 0; i < n; i++) splitPane(window, direction);
}

// ---------------------------------------------------------------------
// createFactoryClient
// ---------------------------------------------------------------------

test("createFactoryClient builds one session with six windows in seed order, dashboard active by default", () => {
  const client = freshClient();
  assert.equal(client.sessions.length, 1);
  const session = activeSessionOf(client)!;
  assert.equal(session.name, "10.42.7.13");
  assert.equal(session.windows.length, 6);
  assert.deepEqual(
    session.windows.map((w) => w.id),
    ["dashboard", "builds", "personnel", "retina-v", "profile", "help"],
  );
  assert.equal(session.activeWindowIdx, 0);
  assert.equal(session.lastWindowIdx, 0);
  assert.equal(session.createdAt, 1_723_000_000_000);
});

test("createFactoryClient seeds each window with one leaf pane running its own id as the initial program", () => {
  const session = freshSession();
  for (const w of session.windows) {
    assert.equal(w.root.type, "leaf");
    const pane = focusedPane(w);
    assert.equal(pane.program, w.id);
    assert.equal(w.activePaneId, pane.id);
    assert.equal(w.autoName, true);
  }
});

test("createFactoryClient pane ids are deterministic — a function of (windowId, index), not a counter", () => {
  const a = freshClient();
  const b = freshClient();
  const sessionA = activeSessionOf(a)!;
  const sessionB = activeSessionOf(b)!;
  assert.deepEqual(
    sessionA.windows.map((w) => focusedPane(w).id),
    sessionB.windows.map((w) => focusedPane(w).id),
  );
  assert.equal(focusedPane(sessionA.windows[1]).id, "builds#0");
});

test("createFactoryClient honors activeWindowId (e.g. a direct /builds SSR route) with no extra bookkeeping", () => {
  const client = createFactoryClient({
    sessionName: "10.42.7.13",
    windows: SIX_WINDOWS,
    epoch: 0,
    activeWindowId: "builds",
  });
  const session = activeSessionOf(client)!;
  assert.equal(session.activeWindowIdx, 1);
  assert.equal(session.lastWindowIdx, 1);
});

test("createFactoryClient falls back to index 0 for an unknown activeWindowId", () => {
  const client = createFactoryClient({
    sessionName: "x",
    windows: SIX_WINDOWS,
    epoch: 0,
    activeWindowId: "nonexistent",
  });
  assert.equal(activeSessionOf(client)!.activeWindowIdx, 0);
});

// ---------------------------------------------------------------------
// selectWindowIndex / cycleWindow
// ---------------------------------------------------------------------

test("selectWindowIndex moves activeWindowIdx and records the previous one as lastWindowIdx", () => {
  const session = freshSession();
  selectWindowIndex(session, 2);
  assert.equal(session.activeWindowIdx, 2);
  assert.equal(session.lastWindowIdx, 0);
  selectWindowIndex(session, 4);
  assert.equal(session.activeWindowIdx, 4);
  assert.equal(session.lastWindowIdx, 2);
});

test("selectWindowIndex is a no-op (including lastWindowIdx) when re-selecting the already-active window", () => {
  const session = freshSession();
  selectWindowIndex(session, 3);
  selectWindowIndex(session, 3);
  assert.equal(session.activeWindowIdx, 3);
  assert.equal(session.lastWindowIdx, 0);
});

test("selectWindowIndex ignores an out-of-range index", () => {
  const session = freshSession();
  selectWindowIndex(session, 99);
  selectWindowIndex(session, -1);
  assert.equal(session.activeWindowIdx, 0);
  assert.equal(session.lastWindowIdx, 0);
});

test("cycleWindow(1) advances and wraps; cycleWindow(-1) is the exact reverse", () => {
  const session = freshSession();
  for (let i = 1; i <= 6; i++) {
    cycleWindow(session, 1);
    assert.equal(session.activeWindowIdx, i % 6);
  }
  // Back at 0. Reverse direction from here retraces the same six windows.
  for (let i = 5; i >= 0; i--) {
    cycleWindow(session, -1);
    assert.equal(session.activeWindowIdx, i);
  }
});

// ---------------------------------------------------------------------
// renameWindowManual
// ---------------------------------------------------------------------

test("renameWindowManual sets the name and permanently disables autoName", () => {
  const session = freshSession();
  renameWindowManual(session, "builds", "builds-x");
  const win = session.windows.find((w) => w.id === "builds")!;
  assert.equal(win.name, "builds-x");
  assert.equal(win.autoName, false);
  // A later program change no longer touches the name.
  setPaneProgram(session, focusedPane(win).id, "personnel");
  assert.equal(win.name, "builds-x");
});

test("renameWindowManual is a no-op for an unknown window id", () => {
  const session = freshSession();
  renameWindowManual(session, "nope", "whatever");
  assert.equal(session.windows.length, 6);
});

// ---------------------------------------------------------------------
// killWindow
// ---------------------------------------------------------------------

test("killWindow refuses (no mutation) when it's the only window left", () => {
  const session = freshSession();
  for (const w of [...session.windows]) {
    if (session.windows.length > 1) killWindow(session, w.id);
  }
  assert.equal(session.windows.length, 1);
  const before = session.windows[0].id;
  const result = killWindow(session, before);
  assert.deepEqual(result, { ok: false, reason: "only-window" });
  assert.equal(session.windows.length, 1);
  assert.equal(session.windows[0].id, before);
});

test("killWindow on the active window falls back to the window that sat right after it", () => {
  const session = freshSession(); // active: dashboard (idx 0)
  const result = killWindow(session, "dashboard");
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    session.windows.map((w) => w.id),
    ["builds", "personnel", "retina-v", "profile", "help"],
  );
  assert.equal(session.windows[session.activeWindowIdx].id, "builds");
});

test("killWindow on the active LAST window wraps to the first remaining window", () => {
  const session = freshSession();
  selectWindowIndex(session, 5); // help — last window, now active
  const result = killWindow(session, "help");
  assert.deepEqual(result, { ok: true });
  assert.equal(session.windows[session.activeWindowIdx].id, "dashboard");
});

test("killWindow reproduces the exact 'kill down to one' sequence byte-for-byte", () => {
  // Mirrors tests/e2e/tmux.spec.ts's "killing every window down to the last
  // one is refused" sequence: always kill whatever is CURRENTLY active.
  const session = freshSession();
  const survivors: string[] = [];
  for (let i = 0; i < 5; i++) {
    const activeId = session.windows[session.activeWindowIdx].id;
    killWindow(session, activeId);
    survivors.push(session.windows[session.activeWindowIdx].id);
  }
  assert.equal(session.windows.length, 1);
  assert.deepEqual(survivors, ["builds", "personnel", "retina-v", "profile", "help"]);
});

test("killWindow on a NON-active window shifts activeWindowIdx/lastWindowIdx down without switching", () => {
  const session = freshSession();
  selectWindowIndex(session, 4); // profile active; lastWindowIdx = 0 (dashboard)
  killWindow(session, "builds"); // idx 1, before both 4 and 0... only before 4
  assert.deepEqual(
    session.windows.map((w) => w.id),
    ["dashboard", "personnel", "retina-v", "profile", "help"],
  );
  // profile shifted from idx 4 to idx 3; dashboard (lastWindowIdx target) stayed at 0.
  assert.equal(session.windows[session.activeWindowIdx].id, "profile");
  assert.equal(session.activeWindowIdx, 3);
  assert.equal(session.lastWindowIdx, 0);
});

// ---------------------------------------------------------------------
// launchProgram / exitProgram / setPaneProgram / auto-rename
// ---------------------------------------------------------------------

test("programDisplayName is the program's own name, except shell -> zsh", () => {
  assert.equal(programDisplayName("builds"), "builds");
  assert.equal(programDisplayName("dashboard"), "dashboard");
  assert.equal(programDisplayName("shell"), "zsh");
});

test("exitProgram drops a pane to shell and auto-renames the window to zsh", () => {
  const session = freshSession();
  const win = activeWindowOf(session); // dashboard
  const pane = focusedPane(win);
  exitProgram(session, pane.id);
  assert.equal(pane.program, "shell");
  assert.equal(win.name, "zsh");
});

test("launchProgram relaunches a program in-pane and restores the auto-rename text", () => {
  const session = freshSession();
  const win = session.windows.find((w) => w.id === "builds")!;
  const pane = focusedPane(win);
  exitProgram(session, pane.id);
  assert.equal(win.name, "zsh");
  launchProgram(session, pane.id, "personnel");
  assert.equal(pane.program, "personnel");
  assert.equal(win.name, "personnel"); // auto-rename follows the NEW program, not the window's own id
});

test("launchProgram into a manually-renamed window changes the program but never the name", () => {
  const session = freshSession();
  const win = session.windows.find((w) => w.id === "builds")!;
  renameWindowManual(session, "builds", "scratch");
  launchProgram(session, focusedPane(win).id, "help");
  assert.equal(focusedPane(win).program, "help");
  assert.equal(win.name, "scratch");
});

test("setPaneProgram / launchProgram / exitProgram are no-ops for an unknown pane id", () => {
  const session = freshSession();
  const before = JSON.stringify(session.windows);
  setPaneProgram(session, "no-such-pane", "help");
  launchProgram(session, "no-such-pane", "help");
  exitProgram(session, "no-such-pane");
  assert.equal(JSON.stringify(session.windows), before);
});

// ---------------------------------------------------------------------
// Pane-tree helpers
// ---------------------------------------------------------------------

test("allPanes/findPaneById/focusedPane agree on the single leaf pane", () => {
  const session = freshSession();
  const win = activeWindowOf(session);
  const panes = allPanes(win.root);
  assert.equal(panes.length, 1);
  assert.equal(findPaneById(win.root, panes[0].id), panes[0]);
  assert.equal(findPaneById(win.root, "bogus"), undefined);
  assert.equal(focusedPane(win), panes[0]);
});

// ---------------------------------------------------------------------
// Factory client: attachSeq / hostPane (PLAN.md Iteration 3 Phase 5 item 5.1)
// ---------------------------------------------------------------------

test("createFactoryClient seeds attachSeq=1, the default session at lastAttachedSeq=1, and an empty hostPane running shell", () => {
  const client = freshClient();
  assert.equal(client.attachSeq, 1);
  assert.equal(activeSessionOf(client)!.lastAttachedSeq, 1);
  assert.equal(client.hostPane.program, "shell");
  assert.deepEqual(client.hostPane.shell.lines, []);
});

test("createFactoryClient seeds the hostPane's scrollback from hostNarrative when given one", () => {
  const client = createFactoryClient({
    sessionName: "10.42.7.13",
    windows: SIX_WINDOWS,
    epoch: 0,
    hostNarrative: [{ text: "hello", kind: "output" }],
  });
  assert.deepEqual(client.hostPane.shell.lines, [{ text: "hello", kind: "output" }]);
});

// ---------------------------------------------------------------------
// Sessions: create / attach / detach (PLAN.md Iteration 3 Phase 5 items
// 5.1/5.2)
// ---------------------------------------------------------------------

test("createSession adds a new session with one auto-named zsh window (window 0), NOT yet attached", () => {
  const client = freshClient();
  const before = client.attachedSessionId;
  const session = createSession(client, "test", 5000);
  assert.equal(client.sessions.length, 2);
  assert.equal(session.name, "test");
  assert.equal(session.windows.length, 1);
  assert.equal(session.windows[0].name, "zsh");
  assert.equal(session.windows[0].number, 0);
  assert.equal(focusedPane(session.windows[0]).program, "shell");
  assert.equal(session.createdAt, 5000);
  assert.equal(session.lastAttachedSeq, 0);
  assert.equal(client.attachedSessionId, before); // unchanged — createSession never attaches on its own
});

test("attachSession switches the client and bumps the session's recency counter", () => {
  const client = freshClient();
  const session = createSession(client, "test", 0);
  attachSession(client, session.id);
  assert.equal(client.attachedSessionId, session.id);
  assert.equal(client.attachSeq, 2);
  assert.equal(session.lastAttachedSeq, 2);
});

test("attachSession is a no-op for an unknown session id", () => {
  const client = freshClient();
  const before = client.attachedSessionId;
  attachSession(client, "no-such-session");
  assert.equal(client.attachedSessionId, before);
  assert.equal(client.attachSeq, 1);
});

test("detachClient nulls attachedSessionId without touching the session list", () => {
  const client = freshClient();
  detachClient(client);
  assert.equal(client.attachedSessionId, null);
  assert.equal(client.sessions.length, 1);
});

// ---------------------------------------------------------------------
// killWindowCascade (PLAN.md Iteration 3 Phase 5 item 5.3 — SUPERSEDES
// Phase 4's "refuse to kill the only window": real tmux kills the SESSION
// when its last window dies, not the client's ability to do so at all)
// ---------------------------------------------------------------------

test("killWindowCascade on a window that ISN'T the session's last one just removes it (delegates to killWindow)", () => {
  const client = freshClient();
  const session = activeSessionOf(client)!;
  const result = killWindowCascade(client, session, "dashboard");
  assert.deepEqual(result, { kind: "window-removed" });
  assert.equal(session.windows.length, 5);
  assert.equal(client.sessions.length, 1);
});

test("killWindowCascade on the attached session's LAST window, with another session still around, silently switches to it", () => {
  const client = freshClient();
  const other = createSession(client, "other", 0);
  attachSession(client, other.id); // other is now the "most recent" and the ATTACHED one

  const defaultSession = client.sessions.find((s) => s.name === "10.42.7.13")!;
  for (const w of [...defaultSession.windows.slice(1)]) killWindow(defaultSession, w.id);
  assert.equal(defaultSession.windows.length, 1);

  // Kill the default session's own last window WHILE `other` is attached —
  // the default session (not attached) is destroyed outright, with no
  // client-level side effect (the attached session is untouched).
  const result = killWindowCascade(client, defaultSession, defaultSession.windows[0].id);
  assert.deepEqual(result, { kind: "session-destroyed", detachedToHost: false });
  assert.equal(client.sessions.length, 1);
  assert.equal(client.attachedSessionId, other.id);
});

test("killWindowCascade on the ATTACHED session's last window switches the client to the most-recently-used REMAINING session", () => {
  const client = freshClient();
  const defaultSession = activeSessionOf(client)!;
  const other = createSession(client, "other", 0);
  attachSession(client, other.id); // other: lastAttachedSeq=2, attached
  attachSession(client, defaultSession.id); // back to default: lastAttachedSeq=3, attached; other is now "most recent unattached"

  for (const w of [...defaultSession.windows.slice(1)]) killWindow(defaultSession, w.id);
  const result = killWindowCascade(client, defaultSession, defaultSession.windows[0].id);
  assert.deepEqual(result, { kind: "session-destroyed", detachedToHost: false });
  assert.equal(client.sessions.length, 1);
  assert.equal(client.attachedSessionId, other.id); // switched, not detached
  assert.equal(client.sessions[0].id, other.id);
});

test("killWindowCascade on the attached session's last window, with NO other session left, detaches to host", () => {
  const client = freshClient();
  const session = activeSessionOf(client)!;
  for (const w of [...session.windows.slice(1)]) killWindow(session, w.id);
  assert.equal(session.windows.length, 1);

  const result = killWindowCascade(client, session, session.windows[0].id);
  assert.deepEqual(result, { kind: "session-destroyed", detachedToHost: true });
  assert.equal(client.sessions.length, 0);
  assert.equal(client.attachedSessionId, null);
});

// ---------------------------------------------------------------------
// killSession (PLAN.md Iteration 3 Phase 6 item 6.5 — choose-tree `x` on a
// session row; advisor-added op mirroring killWindowCascade's own
// "destroy a session outright" bookkeeping, just triggered directly rather
// than as a side effect of its last window dying).
// ---------------------------------------------------------------------

test("killSession on a session that ISN'T attached just removes it, no client-level side effect", () => {
  const client = freshClient();
  const other = createSession(client, "other", 0);
  const result = killSession(client, other.id);
  assert.deepEqual(result, { kind: "session-destroyed", detachedToHost: false });
  assert.equal(client.sessions.length, 1);
  assert.equal(client.attachedSessionId, activeSessionOf(client)!.id);
});

test("killSession on the ATTACHED session switches to the most-recently-used REMAINING one", () => {
  const client = freshClient();
  const defaultSession = activeSessionOf(client)!;
  const other = createSession(client, "other", 0);
  attachSession(client, other.id);
  const result = killSession(client, other.id);
  assert.deepEqual(result, { kind: "session-destroyed", detachedToHost: false });
  assert.equal(client.sessions.length, 1);
  assert.equal(client.attachedSessionId, defaultSession.id);
});

test("killSession on the attached session with no other left detaches to host", () => {
  const client = freshClient();
  const session = activeSessionOf(client)!;
  const result = killSession(client, session.id);
  assert.deepEqual(result, { kind: "session-destroyed", detachedToHost: true });
  assert.equal(client.sessions.length, 0);
  assert.equal(client.attachedSessionId, null);
});

// ---------------------------------------------------------------------
// Splits (PLAN.md Iteration 3 Phase 6 item 6.1)
// ---------------------------------------------------------------------

test("splitPane wraps a single leaf in a new 'row' split, 50/50, focusing the new pane", () => {
  const win = freshWindow();
  const originalPaneId = win.activePaneId;
  splitPane(win, "row");

  assert.equal(win.root.type, "split");
  if (win.root.type !== "split") throw new Error("unreachable");
  assert.equal(win.root.direction, "row");
  assert.deepEqual(win.root.sizes, [0.5, 0.5]);
  assert.equal(win.root.children.length, 2);
  assert.equal(win.root.children[0].type, "leaf");
  assert.equal(win.paneOrder.length, 2);
  assert.equal(win.paneOrder[0], originalPaneId);
  assert.notEqual(win.activePaneId, originalPaneId);
  assert.equal(win.activePaneId, win.paneOrder[1]);
  assert.equal(win.lastPaneId, originalPaneId);
  // The new pane always runs a shell (PLAN.md 6.1 "new panes run shell").
  assert.equal(focusedPane(win).program, "shell");
});

test("splitPane 'column' wraps the same way, direction 'column'", () => {
  const win = freshWindow();
  splitPane(win, "column");
  assert.equal(win.root.type, "split");
  if (win.root.type !== "split") throw new Error("unreachable");
  assert.equal(win.root.direction, "column");
  assert.deepEqual(win.root.sizes, [0.5, 0.5]);
});

test("| then - (row split, then column split on the NEW focused pane) produces the classic tmux L-shape", () => {
  const win = freshWindow();
  const paneA = win.activePaneId;
  splitPane(win, "row"); // A | B, B focused
  const paneB = win.activePaneId;
  splitPane(win, "column"); // B splits into B (top) / C (bottom)
  const paneC = win.activePaneId;

  assert.equal(win.root.type, "split");
  if (win.root.type !== "split") throw new Error("unreachable");
  assert.equal(win.root.direction, "row");
  assert.equal(win.root.children.length, 2); // A is still a DIRECT sibling — untouched by B's own column split
  assert.deepEqual(win.root.sizes, [0.5, 0.5]);
  assert.equal(win.root.children[0].type, "leaf");
  if (win.root.children[0].type !== "leaf") throw new Error("unreachable");
  assert.equal(win.root.children[0].pane.id, paneA);

  const right = win.root.children[1];
  assert.equal(right.type, "split");
  if (right.type !== "split") throw new Error("unreachable");
  assert.equal(right.direction, "column");
  assert.deepEqual(right.sizes, [0.5, 0.5]);
  assert.equal((right.children[0] as { type: "leaf"; pane: Pane }).pane.id, paneB);
  assert.equal((right.children[1] as { type: "leaf"; pane: Pane }).pane.id, paneC);

  assert.deepEqual(win.paneOrder, [paneA, paneB, paneC]);
});

test("splitting the SAME direction as the existing parent inserts a sibling, halving only the split pane's own share", () => {
  const win = freshWindow();
  splitTimes(win, "row", 1); // A(.5) | B(.5), B focused
  // Refocus A, then split it again — same "row" direction as the parent —
  // so A halves its own share; B is untouched.
  const paneA = win.paneOrder[0];
  win.activePaneId = paneA;
  splitPane(win, "row");

  assert.equal(win.root.type, "split");
  if (win.root.type !== "split") throw new Error("unreachable");
  assert.equal(win.root.children.length, 3);
  assert.deepEqual(win.root.sizes, [0.25, 0.25, 0.5]);
  assert.equal((win.root.children[0] as { type: "leaf"; pane: Pane }).pane.id, paneA);
});

test("splitPane ids never collide after a kill-then-split (paneSeq, not paneOrder.length)", () => {
  const win = freshWindow();
  splitPane(win, "row"); // paneSeq now 2, two panes: #0, #1
  const secondPaneId = win.activePaneId;
  killPaneInWindow(win, secondPaneId); // back to one pane; paneOrder.length === 1 again
  splitPane(win, "row"); // if the id were derived from paneOrder.length, this would reuse "#1"
  assert.equal(win.paneOrder.length, 2);
  assert.notEqual(win.paneOrder[1], secondPaneId);
  assert.equal(new Set(win.paneOrder).size, 2); // no collision
});

// ---------------------------------------------------------------------
// Kill-pane (PLAN.md Iteration 3 Phase 6 item 6.3)
// ---------------------------------------------------------------------

test("killPaneInWindow refuses (last-pane) on a single-pane window", () => {
  const win = freshWindow();
  const result = killPaneInWindow(win, win.activePaneId);
  assert.deepEqual(result, { kind: "last-pane" });
  assert.equal(win.root.type, "leaf");
});

test("killPaneInWindow on a 2-pane split collapses back to a bare leaf", () => {
  const win = freshWindow();
  const paneA = win.activePaneId;
  splitPane(win, "row");
  const paneB = win.activePaneId;
  const result = killPaneInWindow(win, paneB);
  assert.deepEqual(result, { kind: "pane-removed" });
  assert.equal(win.root.type, "leaf");
  assert.equal((win.root as { type: "leaf"; pane: Pane }).pane.id, paneA);
  assert.deepEqual(win.paneOrder, [paneA]);
  assert.equal(win.activePaneId, paneA); // focus falls back to the survivor
});

test("killPaneInWindow on a 3-pane row renormalizes the remaining two siblings' sizes back to sum 1", () => {
  const win = freshWindow();
  const paneA = win.paneOrder[0];
  splitPane(win, "row"); // A(.5) B(.5)
  win.activePaneId = paneA;
  splitPane(win, "row"); // A(.25) newC(.25) B(.5)
  const paneC = win.activePaneId;
  killPaneInWindow(win, paneC);

  assert.equal(win.root.type, "split");
  if (win.root.type !== "split") throw new Error("unreachable");
  assert.equal(win.root.children.length, 2);
  const sum = win.root.sizes.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  // A(.25) and B(.5) survive C's removal — renormalized PROPORTIONALLY
  // (ratio preserved: .25:.5 -> 1:2), not reset to an even 50/50.
  assert.deepEqual(
    win.root.sizes.map((s) => Math.round(s * 100) / 100),
    [0.33, 0.67],
  );
});

test("killPaneInWindow focus fallback: killing the focused pane moves focus to the PREVIOUS one in creation order", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "row"); // three panes total, third one focused
  const [paneA, paneB, paneC] = win.paneOrder;
  assert.equal(win.activePaneId, paneC);
  killPaneInWindow(win, paneC);
  assert.equal(win.activePaneId, paneB); // previous in creation order
  killPaneInWindow(win, paneB);
  // no "previous" left (paneB was second) — wraps to the new first pane.
  assert.equal(win.activePaneId, paneA);
});

test("killPaneInWindow on a NON-focused pane doesn't move focus at all", () => {
  const win = freshWindow();
  splitPane(win, "row");
  const [paneA, paneB] = win.paneOrder;
  win.activePaneId = paneA;
  splitPane(win, "row"); // A(.25) newC(.25) B(.5), C focused
  const paneC = win.activePaneId;
  win.activePaneId = paneA; // refocus A
  killPaneInWindow(win, paneC); // kill the NON-focused pane C
  assert.equal(win.activePaneId, paneA);
  assert.deepEqual(win.paneOrder, [paneA, paneB]);
});

test("paneIndexInWindow is live-renumbered (0..n-1, no gaps) after a kill", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "row");
  const [paneA, paneB, paneC] = win.paneOrder;
  assert.equal(paneIndexInWindow(win, paneA), 0);
  assert.equal(paneIndexInWindow(win, paneB), 1);
  assert.equal(paneIndexInWindow(win, paneC), 2);
  killPaneInWindow(win, paneB);
  assert.equal(paneIndexInWindow(win, paneA), 0);
  assert.equal(paneIndexInWindow(win, paneC), 1); // renumbered down, no gap
});

// ---------------------------------------------------------------------
// Pane focus / navigation (PLAN.md Iteration 3 Phase 6 item 6.2)
// ---------------------------------------------------------------------

test("cycleNextPane cycles through paneOrder, wrapping", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "row");
  const [paneA, paneB, paneC] = win.paneOrder;
  win.activePaneId = paneA;
  cycleNextPane(win);
  assert.equal(win.activePaneId, paneB);
  cycleNextPane(win);
  assert.equal(win.activePaneId, paneC);
  cycleNextPane(win);
  assert.equal(win.activePaneId, paneA); // wraps
});

test("cycleNextPane is a no-op on a single-pane window", () => {
  const win = freshWindow();
  const before = win.activePaneId;
  cycleNextPane(win);
  assert.equal(win.activePaneId, before);
});

test("focusLastPane toggles back and forth between the two most recently focused panes", () => {
  const win = freshWindow();
  const paneA = win.activePaneId;
  splitPane(win, "row");
  const paneB = win.activePaneId;
  assert.equal(win.lastPaneId, paneA);
  focusLastPane(win);
  assert.equal(win.activePaneId, paneA);
  assert.equal(win.lastPaneId, paneB);
  focusLastPane(win); // toggles back
  assert.equal(win.activePaneId, paneB);
});

test("focusLastPane is a no-op before any focus change has ever happened", () => {
  const win = freshWindow();
  const before = win.activePaneId;
  focusLastPane(win);
  assert.equal(win.activePaneId, before);
});

test("computePaneRects / findDirectionalPane resolve geometrically for a main-vertical arrangement", () => {
  const win = freshWindow();
  const panes = win.paneOrder.map((id) => findPaneById(win.root, id)!);
  // Build a main-vertical-shaped tree by hand (main pane LEFT full-height,
  // two panes stacked on the right) using three synthetic panes.
  const [main] = panes;
  const b: Pane = { id: "b", program: "shell", shell: main.shell };
  const c: Pane = { id: "c", program: "shell", shell: main.shell };
  win.root = {
    type: "split",
    direction: "row",
    sizes: [0.6, 0.4],
    children: [
      { type: "leaf", pane: main },
      {
        type: "split",
        direction: "column",
        sizes: [0.5, 0.5],
        children: [
          { type: "leaf", pane: b },
          { type: "leaf", pane: c },
        ],
      },
    ],
  };
  win.paneOrder = [main.id, "b", "c"];
  win.activePaneId = main.id;

  const rects = computePaneRects(win.root);
  assert.equal(findDirectionalPane(rects, main.id, "right"), "b"); // nearest of the two on the right (tie -> first found is fine either way, but b/c are equidistant vertically from main's center — accept either)
  assert.equal(findDirectionalPane(rects, "b", "down"), "c");
  assert.equal(findDirectionalPane(rects, "c", "up"), "b");
  assert.equal(findDirectionalPane(rects, "b", "left"), main.id);
  assert.equal(findDirectionalPane(rects, main.id, "left"), undefined); // nothing further left
  assert.equal(findDirectionalPane(rects, main.id, "up"), undefined);

  focusDirectional(win, "right");
  assert.notEqual(win.activePaneId, main.id);
});

// ---------------------------------------------------------------------
// Layout engine (PLAN.md Iteration 3 Phase 6 item 6.4)
// ---------------------------------------------------------------------

function makeTestPanes(n: number): Pane[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, program: "shell" as const, shell: createShellState() }));
}

test("isLayoutName accepts exactly the 7 preset names", () => {
  for (const name of LAYOUT_NAMES) assert.equal(isLayoutName(name), true);
  assert.equal(isLayoutName("bogus"), false);
  assert.equal(isLayoutName(""), false);
});

test("buildLayoutTree: even-horizontal is one row split, N equal children", () => {
  for (const n of [2, 3, 4, 5]) {
    const tree = buildLayoutTree(makeTestPanes(n), "even-horizontal");
    assert.equal(tree.type, "split");
    if (tree.type !== "split") continue;
    assert.equal(tree.direction, "row");
    assert.equal(tree.children.length, n);
    for (const s of tree.sizes) assert.ok(Math.abs(s - 1 / n) < 1e-9);
  }
});

test("buildLayoutTree: even-vertical is one column split, N equal children", () => {
  const tree = buildLayoutTree(makeTestPanes(4), "even-vertical");
  assert.equal(tree.type, "split");
  if (tree.type !== "split") throw new Error("unreachable");
  assert.equal(tree.direction, "column");
  assert.equal(tree.children.length, 4);
});

test("buildLayoutTree: main-horizontal is a column split, main pane (index 0) TOP full-width, others in a row below", () => {
  const panes = makeTestPanes(4);
  const tree = buildLayoutTree(panes, "main-horizontal");
  assert.equal(tree.type, "split");
  if (tree.type !== "split") throw new Error("unreachable");
  assert.equal(tree.direction, "column");
  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].type, "leaf");
  assert.equal((tree.children[0] as { type: "leaf"; pane: Pane }).pane.id, panes[0].id); // pane index 0 = main
  assert.ok(tree.sizes[0] > tree.sizes[1]); // main pane bigger, per fidelity reference
  const bottom = tree.children[1];
  assert.equal(bottom.type, "split");
  if (bottom.type !== "split") throw new Error("unreachable");
  assert.equal(bottom.direction, "row");
  assert.equal(bottom.children.length, 3); // the other 3 panes
});

test("buildLayoutTree: main-horizontal-mirrored puts the main pane on BOTTOM", () => {
  const panes = makeTestPanes(3);
  const tree = buildLayoutTree(panes, "main-horizontal-mirrored");
  assert.equal(tree.type, "split");
  if (tree.type !== "split") throw new Error("unreachable");
  assert.equal(tree.children[1].type, "leaf");
  assert.equal((tree.children[1] as { type: "leaf"; pane: Pane }).pane.id, panes[0].id);
  assert.ok(tree.sizes[1] > tree.sizes[0]);
});

test("buildLayoutTree: main-vertical is a row split, main pane LEFT full-height, others in a column on the right", () => {
  const panes = makeTestPanes(3);
  const tree = buildLayoutTree(panes, "main-vertical");
  assert.equal(tree.type, "split");
  if (tree.type !== "split") throw new Error("unreachable");
  assert.equal(tree.direction, "row");
  assert.equal((tree.children[0] as { type: "leaf"; pane: Pane }).pane.id, panes[0].id);
  const right = tree.children[1];
  assert.equal(right.type, "split");
  if (right.type !== "split") throw new Error("unreachable");
  assert.equal(right.direction, "column");
  assert.equal(right.children.length, 2);
});

test("buildLayoutTree: main-vertical-mirrored puts the main pane on the RIGHT", () => {
  const panes = makeTestPanes(2);
  const tree = buildLayoutTree(panes, "main-vertical-mirrored");
  assert.equal(tree.type, "split");
  if (tree.type !== "split") throw new Error("unreachable");
  assert.equal(tree.direction, "row");
  assert.equal((tree.children[1] as { type: "leaf"; pane: Pane }).pane.id, panes[0].id);
  assert.ok(tree.sizes[1] > tree.sizes[0]);
});

test("buildLayoutTree: tiled forms a near-even grid for 2/3/4/5 panes", () => {
  // n=2 -> cols=2,rows=1: a single row of 2.
  const t2 = buildLayoutTree(makeTestPanes(2), "tiled");
  assert.equal(t2.type, "split");
  if (t2.type === "split") {
    assert.equal(t2.direction, "row");
    assert.equal(t2.children.length, 2);
  }

  // n=3 -> cols=2,rows=2: row of 2, then a short row of exactly 1 pane —
  // which is just that pane's bare leaf (no 1-child row-split wrapper).
  const t3 = buildLayoutTree(makeTestPanes(3), "tiled");
  assert.equal(t3.type, "split");
  if (t3.type !== "split") throw new Error("unreachable");
  assert.equal(t3.direction, "column");
  assert.equal(t3.children.length, 2);
  assert.equal(t3.children[0].type, "split");
  assert.equal((t3.children[0] as { type: "split"; children: unknown[] }).children.length, 2);
  assert.equal(t3.children[1].type, "leaf");

  // n=4 -> cols=2,rows=2: a perfect 2x2 grid.
  const t4 = buildLayoutTree(makeTestPanes(4), "tiled");
  assert.equal(t4.type, "split");
  if (t4.type !== "split") throw new Error("unreachable");
  assert.equal(t4.children.length, 2);
  for (const row of t4.children as { type: "split"; children: unknown[] }[]) assert.equal(row.children.length, 2);

  // n=5 -> cols=3,rows=2: row of 3, then a short row of 2.
  const t5 = buildLayoutTree(makeTestPanes(5), "tiled");
  assert.equal(t5.type, "split");
  if (t5.type !== "split") throw new Error("unreachable");
  assert.equal(t5.children.length, 2);
  const [r1, r2] = t5.children as { type: "split"; children: unknown[] }[];
  assert.equal(r1.children.length, 3);
  assert.equal(r2.children.length, 2);
});

test("buildLayoutTree with a single pane is always a bare leaf, regardless of layout name", () => {
  for (const name of LAYOUT_NAMES) {
    const tree = buildLayoutTree(makeTestPanes(1), name);
    assert.equal(tree.type, "leaf");
  }
});

test("applyLayout rebuilds the window's tree from paneOrder and records lastLayout", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "column"); // some arbitrary manual arrangement, 3 panes
  assert.equal(win.lastLayout, undefined);
  applyLayout(win, "even-vertical");
  assert.equal(win.lastLayout, "even-vertical");
  assert.equal(win.root.type, "split");
  if (win.root.type !== "split") throw new Error("unreachable");
  assert.equal(win.root.direction, "column");
  assert.equal(win.root.children.length, 3);
});

test("nextLayout starts at index 0 (even-horizontal) when lastLayout is unset, then cycles the exact verified order, wrapping", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "row");
  const expectedOrder: LayoutName[] = [
    "even-horizontal",
    "even-vertical",
    "main-horizontal",
    "main-horizontal-mirrored",
    "main-vertical",
    "main-vertical-mirrored",
    "tiled",
  ];
  for (const expected of expectedOrder) {
    nextLayout(win);
    assert.equal(win.lastLayout, expected);
  }
  nextLayout(win); // 8th press wraps back to the start
  assert.equal(win.lastLayout, "even-horizontal");
});

test("reapplyLastLayout is a no-op when nothing has ever been applied", () => {
  const win = freshWindow();
  splitPane(win, "row");
  const before = JSON.stringify(win.root);
  reapplyLastLayout(win);
  assert.equal(JSON.stringify(win.root), before);
  assert.equal(win.lastLayout, undefined);
});

test("reapplyLastLayout re-derives the tree fresh from the CURRENT pane list against the last-applied preset", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "row"); // 3 panes
  applyLayout(win, "even-vertical");
  // A manual split diverges the tree from the applied preset...
  splitPane(win, "row");
  assert.equal(win.paneOrder.length, 4);
  // ...bare select-layout/reapply snaps it back to even-vertical for all 4.
  reapplyLastLayout(win);
  assert.equal(win.root.type, "split");
  if (win.root.type !== "split") throw new Error("unreachable");
  assert.equal(win.root.direction, "column");
  assert.equal(win.root.children.length, 4);
});
