// Unit tests for the tmux client/session/window/pane model
// — src/lib/tmux.ts. No DOM, no Svelte state:
// every operation is exercised directly against plain-object Session/Client
// values (the same shape Terminal.svelte's `$state` proxy wraps at runtime —
// this file proves the operations themselves are correct independent of
// that wrapping).
import { expect, test } from "vitest";
import { createShellState } from "../../src/lib/shell";
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
  createWindow,
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
} from "../../src/lib/tmux";

const SIX_WINDOWS: WindowSeed[] = [
  { number: 0, id: "dashboard", name: "dashboard" },
  { number: 1, id: "repositories", name: "repositories" },
  { number: 2, id: "employment", name: "employment" },
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

test("createFactoryClient repositories one session with six windows in seed order, dashboard active by default", () => {
  const client = freshClient();
  expect(client.sessions.length).toBe(1);
  const session = activeSessionOf(client)!;
  expect(session.name).toBe("10.42.7.13");
  expect(session.windows.length).toBe(6);
  expect(session.windows.map((w) => w.id)).toEqual(["dashboard", "repositories", "employment", "retina-v", "profile", "help"]);
  expect(session.activeWindowIdx).toBe(0);
  expect(session.lastWindowIdx).toBe(0);
  expect(session.createdAt).toBe(1_723_000_000_000);
});

test("createFactoryClient seeds each window with one leaf pane running its own id as the initial program", () => {
  const session = freshSession();
  for (const w of session.windows) {
    expect(w.root.type).toBe("leaf");
    const pane = focusedPane(w);
    expect(pane.program).toBe(w.id);
    expect(w.activePaneId).toBe(pane.id);
    expect(w.autoName).toBe(true);
  }
});

test("createFactoryClient pane ids are deterministic — a function of (windowId, index), not a counter", () => {
  const a = freshClient();
  const b = freshClient();
  const sessionA = activeSessionOf(a)!;
  const sessionB = activeSessionOf(b)!;
  expect(sessionA.windows.map((w) => focusedPane(w).id)).toEqual(sessionB.windows.map((w) => focusedPane(w).id));
  expect(focusedPane(sessionA.windows[1]).id).toBe("repositories#0");
});

test("createFactoryClient honors activeWindowId (e.g. a direct /repositories SSR route) with no extra bookkeeping", () => {
  const client = createFactoryClient({
    sessionName: "10.42.7.13",
    windows: SIX_WINDOWS,
    epoch: 0,
    activeWindowId: "repositories",
  });
  const session = activeSessionOf(client)!;
  expect(session.activeWindowIdx).toBe(1);
  expect(session.lastWindowIdx).toBe(1);
});

test("createFactoryClient falls back to index 0 for an unknown activeWindowId", () => {
  const client = createFactoryClient({
    sessionName: "x",
    windows: SIX_WINDOWS,
    epoch: 0,
    activeWindowId: "nonexistent",
  });
  expect(activeSessionOf(client)!.activeWindowIdx).toBe(0);
});

// ---------------------------------------------------------------------
// selectWindowIndex / cycleWindow
// ---------------------------------------------------------------------

test("selectWindowIndex moves activeWindowIdx and records the previous one as lastWindowIdx", () => {
  const session = freshSession();
  selectWindowIndex(session, 2);
  expect(session.activeWindowIdx).toBe(2);
  expect(session.lastWindowIdx).toBe(0);
  selectWindowIndex(session, 4);
  expect(session.activeWindowIdx).toBe(4);
  expect(session.lastWindowIdx).toBe(2);
});

test("selectWindowIndex is a no-op (including lastWindowIdx) when re-selecting the already-active window", () => {
  const session = freshSession();
  selectWindowIndex(session, 3);
  selectWindowIndex(session, 3);
  expect(session.activeWindowIdx).toBe(3);
  expect(session.lastWindowIdx).toBe(0);
});

test("selectWindowIndex ignores an out-of-range index", () => {
  const session = freshSession();
  selectWindowIndex(session, 99);
  selectWindowIndex(session, -1);
  expect(session.activeWindowIdx).toBe(0);
  expect(session.lastWindowIdx).toBe(0);
});

test("cycleWindow(1) advances and wraps; cycleWindow(-1) is the exact reverse", () => {
  const session = freshSession();
  for (let i = 1; i <= 6; i++) {
    cycleWindow(session, 1);
    expect(session.activeWindowIdx).toBe(i % 6);
  }
  // Back at 0. Reverse direction from here retraces the same six windows.
  for (let i = 5; i >= 0; i--) {
    cycleWindow(session, -1);
    expect(session.activeWindowIdx).toBe(i);
  }
});

// ---------------------------------------------------------------------
// renameWindowManual
// ---------------------------------------------------------------------

test("renameWindowManual sets the name and permanently disables autoName", () => {
  const session = freshSession();
  renameWindowManual(session, "repositories", "repositories-x");
  const win = session.windows.find((w) => w.id === "repositories")!;
  expect(win.name).toBe("repositories-x");
  expect(win.autoName).toBe(false);
  // A later program change no longer touches the name.
  setPaneProgram(session, focusedPane(win).id, "employment");
  expect(win.name).toBe("repositories-x");
});

test("renameWindowManual is a no-op for an unknown window id", () => {
  const session = freshSession();
  renameWindowManual(session, "nope", "whatever");
  expect(session.windows.length).toBe(6);
});

// ---------------------------------------------------------------------
// killWindow
// ---------------------------------------------------------------------

test("killWindow refuses (no mutation) when it's the only window left", () => {
  const session = freshSession();
  for (const w of session.windows) {
    if (session.windows.length > 1) killWindow(session, w.id);
  }
  expect(session.windows.length).toBe(1);
  const before = session.windows[0].id;
  const result = killWindow(session, before);
  expect(result).toEqual({ ok: false, reason: "only-window" });
  expect(session.windows.length).toBe(1);
  expect(session.windows[0].id).toBe(before);
});

test("killWindow on the active window falls back to the window that sat right after it", () => {
  const session = freshSession(); // active: dashboard (idx 0)
  const result = killWindow(session, "dashboard");
  expect(result).toEqual({ ok: true });
  expect(session.windows.map((w) => w.id)).toEqual(["repositories", "employment", "retina-v", "profile", "help"]);
  expect(session.windows[session.activeWindowIdx].id).toBe("repositories");
});

test("killWindow on the active LAST window wraps to the first remaining window", () => {
  const session = freshSession();
  selectWindowIndex(session, 5); // help — last window, now active
  const result = killWindow(session, "help");
  expect(result).toEqual({ ok: true });
  expect(session.windows[session.activeWindowIdx].id).toBe("dashboard");
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
  expect(session.windows.length).toBe(1);
  expect(survivors).toEqual(["repositories", "employment", "retina-v", "profile", "help"]);
});

test("killWindow on a NON-active window shifts activeWindowIdx/lastWindowIdx down without switching", () => {
  const session = freshSession();
  selectWindowIndex(session, 4); // profile active; lastWindowIdx = 0 (dashboard)
  killWindow(session, "repositories"); // idx 1, before both 4 and 0... only before 4
  expect(session.windows.map((w) => w.id)).toEqual(["dashboard", "employment", "retina-v", "profile", "help"]);
  // profile shifted from idx 4 to idx 3; dashboard (lastWindowIdx target) stayed at 0.
  expect(session.windows[session.activeWindowIdx].id).toBe("profile");
  expect(session.activeWindowIdx).toBe(3);
  expect(session.lastWindowIdx).toBe(0);
});

// ---------------------------------------------------------------------
// launchProgram / exitProgram / setPaneProgram / auto-rename
// ---------------------------------------------------------------------

test("programDisplayName is the program's own name, except shell -> zsh", () => {
  expect(programDisplayName("repositories")).toBe("repositories");
  expect(programDisplayName("dashboard")).toBe("dashboard");
  expect(programDisplayName("shell")).toBe("zsh");
});

test("exitProgram drops a pane to shell and auto-renames the window to zsh", () => {
  const session = freshSession();
  const win = activeWindowOf(session); // dashboard
  const pane = focusedPane(win);
  exitProgram(session, pane.id);
  expect(pane.program).toBe("shell");
  expect(win.name).toBe("zsh");
});

test("launchProgram relaunches a program in-pane and restores the auto-rename text", () => {
  const session = freshSession();
  const win = session.windows.find((w) => w.id === "repositories")!;
  const pane = focusedPane(win);
  exitProgram(session, pane.id);
  expect(win.name).toBe("zsh");
  launchProgram(session, pane.id, "employment");
  expect(pane.program).toBe("employment");
  expect(win.name).toBe("employment"); // auto-rename follows the NEW program, not the window's own id
});

test("launchProgram into a manually-renamed window changes the program but never the name", () => {
  const session = freshSession();
  const win = session.windows.find((w) => w.id === "repositories")!;
  renameWindowManual(session, "repositories", "scratch");
  launchProgram(session, focusedPane(win).id, "help");
  expect(focusedPane(win).program).toBe("help");
  expect(win.name).toBe("scratch");
});

test("setPaneProgram / launchProgram / exitProgram are no-ops for an unknown pane id", () => {
  const session = freshSession();
  const before = JSON.stringify(session.windows);
  setPaneProgram(session, "no-such-pane", "help");
  launchProgram(session, "no-such-pane", "help");
  exitProgram(session, "no-such-pane");
  expect(JSON.stringify(session.windows)).toBe(before);
});

// ---------------------------------------------------------------------
// Pane-tree helpers
// ---------------------------------------------------------------------

test("allPanes/findPaneById/focusedPane agree on the single leaf pane", () => {
  const session = freshSession();
  const win = activeWindowOf(session);
  const panes = allPanes(win.root);
  expect(panes.length).toBe(1);
  expect(findPaneById(win.root, panes[0].id)).toBe(panes[0]);
  expect(findPaneById(win.root, "bogus")).toBe(undefined);
  expect(focusedPane(win)).toBe(panes[0]);
});

// ---------------------------------------------------------------------
// Factory client: attachSeq / hostPane
// ---------------------------------------------------------------------

test("createFactoryClient seeds attachSeq=1, the default session at lastAttachedSeq=1, and an empty hostPane running shell", () => {
  const client = freshClient();
  expect(client.attachSeq).toBe(1);
  expect(activeSessionOf(client)!.lastAttachedSeq).toBe(1);
  expect(client.hostPane.program).toBe("shell");
  expect(client.hostPane.shell.lines).toEqual([]);
});

test("createFactoryClient seeds the hostPane's scrollback from hostNarrative when given one", () => {
  const client = createFactoryClient({
    sessionName: "10.42.7.13",
    windows: SIX_WINDOWS,
    epoch: 0,
    hostNarrative: [{ text: "hello", kind: "output" }],
  });
  expect(client.hostPane.shell.lines).toEqual([{ text: "hello", kind: "output" }]);
});

// ---------------------------------------------------------------------
// Sessions: create / attach / detach
// ---------------------------------------------------------------------

test("createSession adds a new session with one auto-named zsh window (window 0), NOT yet attached", () => {
  const client = freshClient();
  const before = client.attachedSessionId;
  const session = createSession(client, "test", 5000);
  expect(client.sessions.length).toBe(2);
  expect(session.name).toBe("test");
  expect(session.windows.length).toBe(1);
  expect(session.windows[0].name).toBe("zsh");
  expect(session.windows[0].number).toBe(0);
  expect(focusedPane(session.windows[0]).program).toBe("shell");
  expect(session.createdAt).toBe(5000);
  expect(session.lastAttachedSeq).toBe(0);
  expect(client.attachedSessionId).toBe(before); // unchanged — createSession never attaches on its own
});

// ---------------------------------------------------------------------
// createWindow (`Ctrl-b c`)
// ---------------------------------------------------------------------

test("createWindow appends a new auto-named zsh window numbered one past the current highest, without touching activeWindowIdx", () => {
  const client = freshClient();
  const session = activeSessionOf(client)!;
  const before = session.activeWindowIdx;
  const win = createWindow(session);
  expect(session.windows.length).toBe(7);
  expect(win.number).toBe(6);
  expect(win.name).toBe("zsh");
  expect(win.autoName).toBe(true);
  expect(focusedPane(win).program).toBe("shell");
  expect(session.activeWindowIdx).toBe(before); // caller activates, not this function
});

test("createWindow twice in a row never collides — numbers 6 then 7, distinct ids", () => {
  const client = freshClient();
  const session = activeSessionOf(client)!;
  const first = createWindow(session);
  const second = createWindow(session);
  expect(first.number).toBe(6);
  expect(second.number).toBe(7);
  expect(first.id).not.toBe(second.id);
});

test("createWindow reuses the freed number (and its deterministic id) after a kill-then-create — the dead window's state is fully gone, so this is harmless (determinism rules: ids are a pure function of session id + number, never a counter)", () => {
  const client = freshClient();
  const session = activeSessionOf(client)!;
  const first = createWindow(session);
  expect(first.number).toBe(6);
  killWindow(session, first.id);
  const second = createWindow(session);
  expect(second.number).toBe(6);
  expect(second.id).toBe(first.id);
  // The killed window is gone from the array (not merely shadowed) — this
  // is a brand-new 7th entry that happens to reuse the freed number/id, not
  // the old one coming back to life.
  expect(session.windows.length).toBe(7);
});

test("attachSession switches the client and bumps the session's recency counter", () => {
  const client = freshClient();
  const session = createSession(client, "test", 0);
  attachSession(client, session.id);
  expect(client.attachedSessionId).toBe(session.id);
  expect(client.attachSeq).toBe(2);
  expect(session.lastAttachedSeq).toBe(2);
});

test("attachSession is a no-op for an unknown session id", () => {
  const client = freshClient();
  const before = client.attachedSessionId;
  attachSession(client, "no-such-session");
  expect(client.attachedSessionId).toBe(before);
  expect(client.attachSeq).toBe(1);
});

test("detachClient nulls attachedSessionId without touching the session list", () => {
  const client = freshClient();
  detachClient(client);
  expect(client.attachedSessionId).toBe(null);
  expect(client.sessions.length).toBe(1);
});

// ---------------------------------------------------------------------
// killWindowCascade — real tmux kills the SESSION
// when its last window dies, not the client's ability to do so at all
// ---------------------------------------------------------------------

test("killWindowCascade on a window that ISN'T the session's last one just removes it (delegates to killWindow)", () => {
  const client = freshClient();
  const session = activeSessionOf(client)!;
  const result = killWindowCascade(client, session, "dashboard");
  expect(result).toEqual({ kind: "window-removed" });
  expect(session.windows.length).toBe(5);
  expect(client.sessions.length).toBe(1);
});

test("killWindowCascade on the attached session's LAST window, with another session still around, silently switches to it", () => {
  const client = freshClient();
  const other = createSession(client, "other", 0);
  attachSession(client, other.id); // other is now the "most recent" and the ATTACHED one

  const defaultSession = client.sessions.find((s) => s.name === "10.42.7.13")!;
  for (const w of defaultSession.windows.slice(1)) killWindow(defaultSession, w.id);
  expect(defaultSession.windows.length).toBe(1);

  // Kill the default session's own last window WHILE `other` is attached —
  // the default session (not attached) is destroyed outright, with no
  // client-level side effect (the attached session is untouched).
  const result = killWindowCascade(client, defaultSession, defaultSession.windows[0].id);
  expect(result).toEqual({ kind: "session-destroyed", detachedToHost: false });
  expect(client.sessions.length).toBe(1);
  expect(client.attachedSessionId).toBe(other.id);
});

test("killWindowCascade on the ATTACHED session's last window switches the client to the most-recently-used REMAINING session", () => {
  const client = freshClient();
  const defaultSession = activeSessionOf(client)!;
  const other = createSession(client, "other", 0);
  attachSession(client, other.id); // other: lastAttachedSeq=2, attached
  attachSession(client, defaultSession.id); // back to default: lastAttachedSeq=3, attached; other is now "most recent unattached"

  for (const w of defaultSession.windows.slice(1)) killWindow(defaultSession, w.id);
  const result = killWindowCascade(client, defaultSession, defaultSession.windows[0].id);
  expect(result).toEqual({ kind: "session-destroyed", detachedToHost: false });
  expect(client.sessions.length).toBe(1);
  expect(client.attachedSessionId).toBe(other.id); // switched, not detached
  expect(client.sessions[0].id).toBe(other.id);
});

test("killWindowCascade on the attached session's last window, with NO other session left, detaches to host", () => {
  const client = freshClient();
  const session = activeSessionOf(client)!;
  for (const w of session.windows.slice(1)) killWindow(session, w.id);
  expect(session.windows.length).toBe(1);

  const result = killWindowCascade(client, session, session.windows[0].id);
  expect(result).toEqual({ kind: "session-destroyed", detachedToHost: true });
  expect(client.sessions.length).toBe(0);
  expect(client.attachedSessionId).toBe(null);
});

// ---------------------------------------------------------------------
// killSession — choose-tree `x` on a
// session row; mirrors killWindowCascade's own
// "destroy a session outright" bookkeeping, just triggered directly rather
// than as a side effect of its last window dying.
// ---------------------------------------------------------------------

test("killSession on a session that ISN'T attached just removes it, no client-level side effect", () => {
  const client = freshClient();
  const other = createSession(client, "other", 0);
  const result = killSession(client, other.id);
  expect(result).toEqual({ kind: "session-destroyed", detachedToHost: false });
  expect(client.sessions.length).toBe(1);
  expect(client.attachedSessionId).toBe(activeSessionOf(client)!.id);
});

test("killSession on the ATTACHED session switches to the most-recently-used REMAINING one", () => {
  const client = freshClient();
  const defaultSession = activeSessionOf(client)!;
  const other = createSession(client, "other", 0);
  attachSession(client, other.id);
  const result = killSession(client, other.id);
  expect(result).toEqual({ kind: "session-destroyed", detachedToHost: false });
  expect(client.sessions.length).toBe(1);
  expect(client.attachedSessionId).toBe(defaultSession.id);
});

test("killSession on the attached session with no other left detaches to host", () => {
  const client = freshClient();
  const session = activeSessionOf(client)!;
  const result = killSession(client, session.id);
  expect(result).toEqual({ kind: "session-destroyed", detachedToHost: true });
  expect(client.sessions.length).toBe(0);
  expect(client.attachedSessionId).toBe(null);
});

// ---------------------------------------------------------------------
// Splits
// ---------------------------------------------------------------------

test("splitPane wraps a single leaf in a new 'row' split, 50/50, focusing the new pane", () => {
  const win = freshWindow();
  const originalPaneId = win.activePaneId;
  splitPane(win, "row");

  expect(win.root.type).toBe("split");
  if (win.root.type !== "split") throw new Error("unreachable");
  expect(win.root.direction).toBe("row");
  expect(win.root.sizes).toEqual([0.5, 0.5]);
  expect(win.root.children.length).toBe(2);
  expect(win.root.children[0].type).toBe("leaf");
  expect(win.paneOrder.length).toBe(2);
  expect(win.paneOrder[0]).toBe(originalPaneId);
  expect(win.activePaneId).not.toBe(originalPaneId);
  expect(win.activePaneId).toBe(win.paneOrder[1]);
  expect(win.lastPaneId).toBe(originalPaneId);
  // The new pane always runs a shell.
  expect(focusedPane(win).program).toBe("shell");
});

test("splitPane 'column' wraps the same way, direction 'column'", () => {
  const win = freshWindow();
  splitPane(win, "column");
  expect(win.root.type).toBe("split");
  if (win.root.type !== "split") throw new Error("unreachable");
  expect(win.root.direction).toBe("column");
  expect(win.root.sizes).toEqual([0.5, 0.5]);
});

test("| then - (row split, then column split on the NEW focused pane) produces the classic tmux L-shape", () => {
  const win = freshWindow();
  const paneA = win.activePaneId;
  splitPane(win, "row"); // A | B, B focused
  const paneB = win.activePaneId;
  splitPane(win, "column"); // B splits into B (top) / C (bottom)
  const paneC = win.activePaneId;

  expect(win.root.type).toBe("split");
  if (win.root.type !== "split") throw new Error("unreachable");
  expect(win.root.direction).toBe("row");
  expect(win.root.children.length).toBe(2); // A is still a DIRECT sibling — untouched by B's own column split
  expect(win.root.sizes).toEqual([0.5, 0.5]);
  expect(win.root.children[0].type).toBe("leaf");
  if (win.root.children[0].type !== "leaf") throw new Error("unreachable");
  expect(win.root.children[0].pane.id).toBe(paneA);

  const right = win.root.children[1];
  expect(right.type).toBe("split");
  if (right.type !== "split") throw new Error("unreachable");
  expect(right.direction).toBe("column");
  expect(right.sizes).toEqual([0.5, 0.5]);
  expect((right.children[0] as { type: "leaf"; pane: Pane }).pane.id).toBe(paneB);
  expect((right.children[1] as { type: "leaf"; pane: Pane }).pane.id).toBe(paneC);

  expect(win.paneOrder).toEqual([paneA, paneB, paneC]);
});

test("splitting the SAME direction as the existing parent inserts a sibling, halving only the split pane's own share", () => {
  const win = freshWindow();
  splitTimes(win, "row", 1); // A(.5) | B(.5), B focused
  // Refocus A, then split it again — same "row" direction as the parent —
  // so A halves its own share; B is untouched.
  const paneA = win.paneOrder[0];
  win.activePaneId = paneA;
  splitPane(win, "row");

  expect(win.root.type).toBe("split");
  if (win.root.type !== "split") throw new Error("unreachable");
  expect(win.root.children.length).toBe(3);
  expect(win.root.sizes).toEqual([0.25, 0.25, 0.5]);
  expect((win.root.children[0] as { type: "leaf"; pane: Pane }).pane.id).toBe(paneA);
});

test("splitPane ids never collide after a kill-then-split (paneSeq, not paneOrder.length)", () => {
  const win = freshWindow();
  splitPane(win, "row"); // paneSeq now 2, two panes: #0, #1
  const secondPaneId = win.activePaneId;
  killPaneInWindow(win, secondPaneId); // back to one pane; paneOrder.length === 1 again
  splitPane(win, "row"); // if the id were derived from paneOrder.length, this would reuse "#1"
  expect(win.paneOrder.length).toBe(2);
  expect(win.paneOrder[1]).not.toBe(secondPaneId);
  expect(new Set(win.paneOrder).size).toBe(2); // no collision
});

// ---------------------------------------------------------------------
// Kill-pane
// ---------------------------------------------------------------------

test("killPaneInWindow refuses (last-pane) on a single-pane window", () => {
  const win = freshWindow();
  const result = killPaneInWindow(win, win.activePaneId);
  expect(result).toEqual({ kind: "last-pane" });
  expect(win.root.type).toBe("leaf");
});

test("killPaneInWindow on a 2-pane split collapses back to a bare leaf", () => {
  const win = freshWindow();
  const paneA = win.activePaneId;
  splitPane(win, "row");
  const paneB = win.activePaneId;
  const result = killPaneInWindow(win, paneB);
  expect(result).toEqual({ kind: "pane-removed" });
  expect(win.root.type).toBe("leaf");
  expect((win.root as { type: "leaf"; pane: Pane }).pane.id).toBe(paneA);
  expect(win.paneOrder).toEqual([paneA]);
  expect(win.activePaneId).toBe(paneA); // focus falls back to the survivor
});

test("killPaneInWindow on a 3-pane row renormalizes the remaining two siblings' sizes back to sum 1", () => {
  const win = freshWindow();
  const paneA = win.paneOrder[0];
  splitPane(win, "row"); // A(.5) B(.5)
  win.activePaneId = paneA;
  splitPane(win, "row"); // A(.25) newC(.25) B(.5)
  const paneC = win.activePaneId;
  killPaneInWindow(win, paneC);

  expect(win.root.type).toBe("split");
  if (win.root.type !== "split") throw new Error("unreachable");
  expect(win.root.children.length).toBe(2);
  const sum = win.root.sizes.reduce((a, b) => a + b, 0);
  expect(Math.abs(sum - 1) < 1e-9).toBeTruthy();
  // A(.25) and B(.5) survive C's removal — renormalized PROPORTIONALLY
  // (ratio preserved: .25:.5 -> 1:2), not reset to an even 50/50.
  expect(win.root.sizes.map((s) => Math.round(s * 100) / 100)).toEqual([0.33, 0.67]);
});

test("killPaneInWindow focus fallback: killing the focused pane moves focus to the PREVIOUS one in creation order", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "row"); // three panes total, third one focused
  const [paneA, paneB, paneC] = win.paneOrder;
  expect(win.activePaneId).toBe(paneC);
  killPaneInWindow(win, paneC);
  expect(win.activePaneId).toBe(paneB); // previous in creation order
  killPaneInWindow(win, paneB);
  // no "previous" left (paneB was second) — wraps to the new first pane.
  expect(win.activePaneId).toBe(paneA);
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
  expect(win.activePaneId).toBe(paneA);
  expect(win.paneOrder).toEqual([paneA, paneB]);
});

test("paneIndexInWindow is live-renumbered (0..n-1, no gaps) after a kill", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "row");
  const [paneA, paneB, paneC] = win.paneOrder;
  expect(paneIndexInWindow(win, paneA)).toBe(0);
  expect(paneIndexInWindow(win, paneB)).toBe(1);
  expect(paneIndexInWindow(win, paneC)).toBe(2);
  killPaneInWindow(win, paneB);
  expect(paneIndexInWindow(win, paneA)).toBe(0);
  expect(paneIndexInWindow(win, paneC)).toBe(1); // renumbered down, no gap
});

// ---------------------------------------------------------------------
// Pane focus / navigation
// ---------------------------------------------------------------------

test("cycleNextPane cycles through paneOrder, wrapping", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "row");
  const [paneA, paneB, paneC] = win.paneOrder;
  win.activePaneId = paneA;
  cycleNextPane(win);
  expect(win.activePaneId).toBe(paneB);
  cycleNextPane(win);
  expect(win.activePaneId).toBe(paneC);
  cycleNextPane(win);
  expect(win.activePaneId).toBe(paneA); // wraps
});

test("cycleNextPane is a no-op on a single-pane window", () => {
  const win = freshWindow();
  const before = win.activePaneId;
  cycleNextPane(win);
  expect(win.activePaneId).toBe(before);
});

test("focusLastPane toggles back and forth between the two most recently focused panes", () => {
  const win = freshWindow();
  const paneA = win.activePaneId;
  splitPane(win, "row");
  const paneB = win.activePaneId;
  expect(win.lastPaneId).toBe(paneA);
  focusLastPane(win);
  expect(win.activePaneId).toBe(paneA);
  expect(win.lastPaneId).toBe(paneB);
  focusLastPane(win); // toggles back
  expect(win.activePaneId).toBe(paneB);
});

test("focusLastPane is a no-op before any focus change has ever happened", () => {
  const win = freshWindow();
  const before = win.activePaneId;
  focusLastPane(win);
  expect(win.activePaneId).toBe(before);
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
  expect(findDirectionalPane(rects, main.id, "right")).toBe("b"); // nearest of the two on the right (tie -> first found is fine either way, but b/c are equidistant vertically from main's center — accept either)
  expect(findDirectionalPane(rects, "b", "down")).toBe("c");
  expect(findDirectionalPane(rects, "c", "up")).toBe("b");
  expect(findDirectionalPane(rects, "b", "left")).toBe(main.id);
  expect(findDirectionalPane(rects, main.id, "left")).toBe(undefined); // nothing further left
  expect(findDirectionalPane(rects, main.id, "up")).toBe(undefined);

  focusDirectional(win, "right");
  expect(win.activePaneId).not.toBe(main.id);
});

// ---------------------------------------------------------------------
// Layout engine
// ---------------------------------------------------------------------

function makeTestPanes(n: number): Pane[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, program: "shell" as const, shell: createShellState() }));
}

test("isLayoutName accepts exactly the 7 preset names", () => {
  for (const name of LAYOUT_NAMES) expect(isLayoutName(name)).toBe(true);
  expect(isLayoutName("bogus")).toBe(false);
  expect(isLayoutName("")).toBe(false);
});

test("buildLayoutTree: even-horizontal is one row split, N equal children", () => {
  for (const n of [2, 3, 4, 5]) {
    const tree = buildLayoutTree(makeTestPanes(n), "even-horizontal");
    expect(tree.type).toBe("split");
    if (tree.type !== "split") continue;
    expect(tree.direction).toBe("row");
    expect(tree.children.length).toBe(n);
    for (const s of tree.sizes) expect(Math.abs(s - 1 / n) < 1e-9).toBeTruthy();
  }
});

test("buildLayoutTree: even-vertical is one column split, N equal children", () => {
  const tree = buildLayoutTree(makeTestPanes(4), "even-vertical");
  expect(tree.type).toBe("split");
  if (tree.type !== "split") throw new Error("unreachable");
  expect(tree.direction).toBe("column");
  expect(tree.children.length).toBe(4);
});

test("buildLayoutTree: main-horizontal is a column split, main pane (index 0) TOP full-width, others in a row below", () => {
  const panes = makeTestPanes(4);
  const tree = buildLayoutTree(panes, "main-horizontal");
  expect(tree.type).toBe("split");
  if (tree.type !== "split") throw new Error("unreachable");
  expect(tree.direction).toBe("column");
  expect(tree.children.length).toBe(2);
  expect(tree.children[0].type).toBe("leaf");
  expect((tree.children[0] as { type: "leaf"; pane: Pane }).pane.id).toBe(panes[0].id); // pane index 0 = main
  expect(tree.sizes[0] > tree.sizes[1]).toBeTruthy(); // main pane bigger, per fidelity reference
  const bottom = tree.children[1];
  expect(bottom.type).toBe("split");
  if (bottom.type !== "split") throw new Error("unreachable");
  expect(bottom.direction).toBe("row");
  expect(bottom.children.length).toBe(3); // the other 3 panes
});

test("buildLayoutTree: main-horizontal-mirrored puts the main pane on BOTTOM", () => {
  const panes = makeTestPanes(3);
  const tree = buildLayoutTree(panes, "main-horizontal-mirrored");
  expect(tree.type).toBe("split");
  if (tree.type !== "split") throw new Error("unreachable");
  expect(tree.children[1].type).toBe("leaf");
  expect((tree.children[1] as { type: "leaf"; pane: Pane }).pane.id).toBe(panes[0].id);
  expect(tree.sizes[1] > tree.sizes[0]).toBeTruthy();
});

test("buildLayoutTree: main-vertical is a row split, main pane LEFT full-height, others in a column on the right", () => {
  const panes = makeTestPanes(3);
  const tree = buildLayoutTree(panes, "main-vertical");
  expect(tree.type).toBe("split");
  if (tree.type !== "split") throw new Error("unreachable");
  expect(tree.direction).toBe("row");
  expect((tree.children[0] as { type: "leaf"; pane: Pane }).pane.id).toBe(panes[0].id);
  const right = tree.children[1];
  expect(right.type).toBe("split");
  if (right.type !== "split") throw new Error("unreachable");
  expect(right.direction).toBe("column");
  expect(right.children.length).toBe(2);
});

test("buildLayoutTree: main-vertical-mirrored puts the main pane on the RIGHT", () => {
  const panes = makeTestPanes(2);
  const tree = buildLayoutTree(panes, "main-vertical-mirrored");
  expect(tree.type).toBe("split");
  if (tree.type !== "split") throw new Error("unreachable");
  expect(tree.direction).toBe("row");
  expect((tree.children[1] as { type: "leaf"; pane: Pane }).pane.id).toBe(panes[0].id);
  expect(tree.sizes[1] > tree.sizes[0]).toBeTruthy();
});

test("buildLayoutTree: tiled forms a near-even grid for 2/3/4/5 panes", () => {
  // n=2 -> cols=2,rows=1: a single row of 2.
  const t2 = buildLayoutTree(makeTestPanes(2), "tiled");
  expect(t2.type).toBe("split");
  if (t2.type === "split") {
    expect(t2.direction).toBe("row");
    expect(t2.children.length).toBe(2);
  }

  // n=3 -> cols=2,rows=2: row of 2, then a short row of exactly 1 pane —
  // which is just that pane's bare leaf (no 1-child row-split wrapper).
  const t3 = buildLayoutTree(makeTestPanes(3), "tiled");
  expect(t3.type).toBe("split");
  if (t3.type !== "split") throw new Error("unreachable");
  expect(t3.direction).toBe("column");
  expect(t3.children.length).toBe(2);
  expect(t3.children[0].type).toBe("split");
  expect((t3.children[0] as { type: "split"; children: unknown[] }).children.length).toBe(2);
  expect(t3.children[1].type).toBe("leaf");

  // n=4 -> cols=2,rows=2: a perfect 2x2 grid.
  const t4 = buildLayoutTree(makeTestPanes(4), "tiled");
  expect(t4.type).toBe("split");
  if (t4.type !== "split") throw new Error("unreachable");
  expect(t4.children.length).toBe(2);
  for (const row of t4.children as { type: "split"; children: unknown[] }[]) expect(row.children.length).toBe(2);

  // n=5 -> cols=3,rows=2: row of 3, then a short row of 2.
  const t5 = buildLayoutTree(makeTestPanes(5), "tiled");
  expect(t5.type).toBe("split");
  if (t5.type !== "split") throw new Error("unreachable");
  expect(t5.children.length).toBe(2);
  const [r1, r2] = t5.children as { type: "split"; children: unknown[] }[];
  expect(r1.children.length).toBe(3);
  expect(r2.children.length).toBe(2);
});

test("buildLayoutTree with a single pane is always a bare leaf, regardless of layout name", () => {
  for (const name of LAYOUT_NAMES) {
    const tree = buildLayoutTree(makeTestPanes(1), name);
    expect(tree.type).toBe("leaf");
  }
});

test("applyLayout rebuilds the window's tree from paneOrder and records lastLayout", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "column"); // some arbitrary manual arrangement, 3 panes
  expect(win.lastLayout).toBe(undefined);
  applyLayout(win, "even-vertical");
  expect(win.lastLayout).toBe("even-vertical");
  expect(win.root.type).toBe("split");
  if (win.root.type !== "split") throw new Error("unreachable");
  expect(win.root.direction).toBe("column");
  expect(win.root.children.length).toBe(3);
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
    expect(win.lastLayout).toBe(expected);
  }
  nextLayout(win); // 8th press wraps back to the start
  expect(win.lastLayout).toBe("even-horizontal");
});

test("reapplyLastLayout is a no-op when nothing has ever been applied", () => {
  const win = freshWindow();
  splitPane(win, "row");
  const before = JSON.stringify(win.root);
  reapplyLastLayout(win);
  expect(JSON.stringify(win.root)).toBe(before);
  expect(win.lastLayout).toBe(undefined);
});

test("reapplyLastLayout re-derives the tree fresh from the CURRENT pane list against the last-applied preset", () => {
  const win = freshWindow();
  splitPane(win, "row");
  splitPane(win, "row"); // 3 panes
  applyLayout(win, "even-vertical");
  // A manual split diverges the tree from the applied preset...
  splitPane(win, "row");
  expect(win.paneOrder.length).toBe(4);
  // ...bare select-layout/reapply snaps it back to even-vertical for all 4.
  reapplyLastLayout(win);
  expect(win.root.type).toBe("split");
  if (win.root.type !== "split") throw new Error("unreachable");
  expect(win.root.direction).toBe("column");
  expect(win.root.children.length).toBe(4);
});
