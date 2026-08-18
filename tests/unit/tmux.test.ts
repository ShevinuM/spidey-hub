// Unit tests for the tmux client/session/window/pane model (PLAN.md
// Iteration 3 Phase 4 item 4.1) — src/lib/tmux.ts. No DOM, no Svelte state:
// every operation is exercised directly against plain-object Session/Client
// values (the same shape Terminal.svelte's `$state` proxy wraps at runtime —
// this file proves the operations themselves are correct independent of
// that wrapping).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeSessionOf,
  activeWindowOf,
  allPanes,
  createFactoryClient,
  cycleWindow,
  exitProgram,
  findPaneById,
  focusedPane,
  killWindow,
  launchProgram,
  programDisplayName,
  renameWindowManual,
  selectWindowIndex,
  setPaneProgram,
  type Client,
  type Session,
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
