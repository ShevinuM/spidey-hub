// Unit tests for the pure shell parser/builtins/fs-navigation logic (PLAN.md
// Iteration 3 Phase 4 item 4.5) — src/lib/shell.ts. No DOM, no fetch: a
// small fixture fs index + a hand-built ShellData-shaped fixture (same
// "structurally equivalent fixture, not the real yaml" convention
// tests/unit/cmdline.test.ts already uses) stand in for the generated
// index and src/data/shell.yaml.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backspace,
  createShellState,
  formatPrompt,
  historyDown,
  historyUp,
  joinPath,
  kindOf,
  listDir,
  nextNumericSessionName,
  parseLine,
  renderTree,
  resolveCatTarget,
  resolveCd,
  resolveSegments,
  runCommand,
  seedHostNarrative,
  typeChar,
  type FsEntry,
  type RunContext,
  type SessionRosterEntry,
  type ShellState,
} from "../../src/lib/shell.ts";
import type { ShellData } from "../../src/lib/data.ts";
import { formatCtime } from "../../src/lib/clock.ts";

const FS: FsEntry[] = [
  { path: "package.json", size: 100 },
  { path: "README.md", size: 200 },
  { path: "src/lib/tmux.ts", size: 300 },
  { path: "src/lib/clock.ts", size: 150 },
  { path: "src/lib/deep/a/b/c.ts", size: 10 },
  { path: "src/components/Terminal.svelte", size: 400 },
  { path: "repos/Sheldon/README.md" },
  { path: "repos/Sheldon/src/main.py" },
];

const SHELL: ShellData = {
  prompt: { paneTemplate: "shev@edith:~/shevinum.dev{path} $ ", hostTemplate: "shev@edith:~/shevinum.dev git:(main) $ " },
  homeLabel: "~/shevinum.dev",
  errors: {
    commandNotFoundTemplate: "{cmd}: command not found",
    cdNoSuchDirTemplate: "cd: no such file or directory: {path}",
    cdNotADirTemplate: "cd: not a directory: {path}",
    lsNoSuchTemplate: "ls: cannot access '{path}': No such file or directory",
    catMissingArgMessage: "cat: missing operand",
    catNoSuchFileTemplate: "cat: {path}: No such file or directory",
    catIsADirTemplate: "cat: {path}: Is a directory",
    catUnindexedTemplate: "cat: {path}: binary or unindexed",
    nestedTmuxMessage: "sessions should be nested with care, unset $TMUX to force",
    tmuxUnknownSubcommandTemplate: "usage: tmux {cmd}",
  },
  sudo: { message: "shev is not in the sudoers file. This incident will be reported to D.O.O.M." },
  whoami: "shev",
  viewNames: { label: "available views:" },
  help: { intro: "builtins:", rows: [{ cmd: "cd <path>", description: "change directory" }] },
  neofetch: {
    art: ["/\\"],
    fields: [{ label: "OS", value: "E.D.I.T.H OS" }],
    uptimeLabel: "Uptime",
    uptimeTemplate: "{mins} min",
  },
  tmux: {
    lsRowTemplate: "{name}: {n} windows (created {ctime})",
    lsAttachedSuffix: " (attached)",
    noSessionsMessage: "no sessions",
    duplicateSessionTemplate: "duplicate session: {name}",
    cantFindSessionTemplate: "can't find session: {name}",
  },
  host: {
    narrative: [
      { text: "E.D.I.T.H shell · zsh 5.9 · session {session}", kind: "output" },
      { text: "shev@edith:~/shevinum.dev git:(main) $ tmux new -s {session}", kind: "input" },
    ],
    detachedTemplate: "[detached (from session {name})]",
    exitedMessage: "[exited]",
    logoutMessage: "logout",
    notAttachedMessage: "not attached — try: tmux a",
    windowGoneTemplate: "{view} window not found — attached to session {name}",
  },
};

const VIEW_NAMES = ["dashboard", "builds", "personnel", "retina-v", "profile", "help"] as const;

const DEFAULT_SESSION: SessionRosterEntry = {
  id: "session-0",
  name: "10.42.7.13",
  windowCount: 6,
  createdAt: 1_723_000_000_000,
  attached: true,
  lastAttachedSeq: 1,
  windowIds: ["dashboard", "builds", "personnel", "retina-v", "profile", "help"],
};

function ctx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    fsEntries: FS,
    resolveContent: () => undefined,
    mode: "pane",
    nowMs: 1_723_000_000_000,
    session: { name: "10.42.7.13", windowCount: 6, createdAt: 1_723_000_000_000, attached: true },
    sessions: [DEFAULT_SESSION],
    defaultSessionName: "10.42.7.13",
    shell: SHELL,
    viewNames: VIEW_NAMES,
    ...overrides,
  };
}

function run(state: ShellState, line: string, overrides: Partial<RunContext> = {}) {
  return runCommand(state, line, ctx(overrides));
}

// ---------------------------------------------------------------------
// parseLine
// ---------------------------------------------------------------------

test("parseLine splits command + args on whitespace, tolerating repeats", () => {
  assert.deepEqual(parseLine("cd   src/lib"), { cmd: "cd", args: ["src/lib"] });
  assert.deepEqual(parseLine("pwd"), { cmd: "pwd", args: [] });
  assert.deepEqual(parseLine("   "), { cmd: "", args: [] });
});

// ---------------------------------------------------------------------
// resolveSegments
// ---------------------------------------------------------------------

test("resolveSegments: relative descent, '..', '.', and absolute paths", () => {
  assert.deepEqual(resolveSegments([], "src/lib"), ["src", "lib"]);
  assert.deepEqual(resolveSegments(["src", "lib"], ".."), ["src"]);
  assert.deepEqual(resolveSegments(["src", "lib"], "../.."), []);
  assert.deepEqual(resolveSegments(["src"], "../../../.."), []); // never goes negative
  assert.deepEqual(resolveSegments(["src"], "./lib"), ["src", "lib"]);
  assert.deepEqual(resolveSegments(["src", "lib"], "/README.md"), ["README.md"]);
});

// ---------------------------------------------------------------------
// kindOf / listDir
// ---------------------------------------------------------------------

test("kindOf: root is always a dir; exact file match; directory prefix; missing", () => {
  assert.equal(kindOf(FS, []), "dir");
  assert.equal(kindOf(FS, ["package.json"]), "file");
  assert.equal(kindOf(FS, ["src"]), "dir");
  assert.equal(kindOf(FS, ["src", "lib"]), "dir");
  assert.equal(kindOf(FS, ["nope"]), "missing");
});

test("listDir at root: dirs before files, localeCompare name order", () => {
  const rows = listDir(FS, []);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["repos", "src", "package.json", "README.md"],
  );
  assert.equal(rows[0].type, "dir");
  assert.equal(rows[2].type, "file");
});

test("listDir descends into a nested directory", () => {
  const rows = listDir(FS, ["src"]);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["components", "lib"],
  );
});

test("joinPath round-trips segments", () => {
  assert.equal(joinPath(["src", "lib"]), "src/lib");
  assert.equal(joinPath([]), "");
});

// ---------------------------------------------------------------------
// renderTree
// ---------------------------------------------------------------------

test("renderTree: connectors, and depth cap 3 replaces deeper children with a … marker", () => {
  const lines = renderTree(FS, ["src"]);
  assert.equal(lines[0], "src");
  assert.ok(lines.some((l) => l.startsWith("├── ") || l.startsWith("└── ")));
  // src/lib/deep/a/b/c.ts is 4 levels below src/lib (deep -> a -> b -> c.ts)
  // — capped at depth 3, so "b" (the 3rd level down) shows a … instead of
  // descending into its own child. (Not `.trim() === "…"`: a `…` line's own
  // indent can itself contain a "│" continuation glyph from a sibling still
  // to come, e.g. "    │       …" — trim() only strips actual whitespace,
  // so the marker is asserted with `endsWith` instead.)
  assert.ok(lines.some((l) => l.endsWith("…")));
  assert.ok(!lines.some((l) => l.includes("c.ts")));
});

// ---------------------------------------------------------------------
// resolveCd
// ---------------------------------------------------------------------

test("resolveCd: success into an existing directory", () => {
  const result = resolveCd(FS, [], "src/lib", SHELL.errors);
  assert.deepEqual(result, { ok: true, cwd: ["src", "lib"] });
});

test("resolveCd: missing path", () => {
  const result = resolveCd(FS, [], "nope", SHELL.errors);
  assert.deepEqual(result, { ok: false, error: "cd: no such file or directory: nope" });
});

test("resolveCd: refuses a file target", () => {
  const result = resolveCd(FS, [], "package.json", SHELL.errors);
  assert.deepEqual(result, { ok: false, error: "cd: not a directory: package.json" });
});

// ---------------------------------------------------------------------
// resolveCatTarget
// ---------------------------------------------------------------------

test("resolveCatTarget: a site file resolves to kind 'site'", () => {
  assert.deepEqual(resolveCatTarget(FS, [], "package.json"), { kind: "site", path: "package.json" });
});

test("resolveCatTarget: a repos/<name>/... file resolves to kind 'repo'", () => {
  assert.deepEqual(resolveCatTarget(FS, [], "repos/Sheldon/README.md"), {
    kind: "repo",
    repo: "Sheldon",
    path: "README.md",
  });
});

test("resolveCatTarget: a directory and a missing path", () => {
  assert.deepEqual(resolveCatTarget(FS, [], "src"), { kind: "dir" });
  assert.deepEqual(resolveCatTarget(FS, [], "nope"), { kind: "missing" });
});

// ---------------------------------------------------------------------
// formatPrompt
// ---------------------------------------------------------------------

test("formatPrompt: pane mode reflects cwd; host mode ignores it", () => {
  assert.equal(formatPrompt("pane", SHELL, []), "shev@edith:~/shevinum.dev $ ");
  assert.equal(formatPrompt("pane", SHELL, ["src", "lib"]), "shev@edith:~/shevinum.dev/src/lib $ ");
  assert.equal(formatPrompt("host", SHELL, ["src"]), "shev@edith:~/shevinum.dev git:(main) $ ");
});

// ---------------------------------------------------------------------
// History / input editing
// ---------------------------------------------------------------------

test("typeChar/backspace edit input and reset historyIndex", () => {
  let s = createShellState();
  s = typeChar(s, "l");
  s = typeChar(s, "s");
  assert.equal(s.input, "ls");
  s = backspace(s);
  assert.equal(s.input, "l");
});

test("historyUp/historyDown walk backward then forward, restoring the draft", () => {
  let s = createShellState();
  s = { ...s, history: ["pwd", "ls", "whoami"] };
  s = typeChar(s, "w"); // in-progress draft "w"
  s = historyUp(s);
  assert.equal(s.input, "whoami");
  s = historyUp(s);
  assert.equal(s.input, "ls");
  s = historyUp(s);
  assert.equal(s.input, "pwd");
  s = historyUp(s); // clamps at the oldest entry
  assert.equal(s.input, "pwd");
  s = historyDown(s);
  assert.equal(s.input, "ls");
  s = historyDown(s);
  assert.equal(s.input, "whoami");
  s = historyDown(s); // past the newest — restores the pre-browse draft
  assert.equal(s.input, "w");
  assert.equal(s.historyIndex, null);
});

test("historyUp on an empty history is a no-op", () => {
  const s = createShellState();
  assert.equal(historyUp(s), s);
});

// ---------------------------------------------------------------------
// runCommand
// ---------------------------------------------------------------------

test("runCommand: a blank line is a no-op (no echo, no history growth)", () => {
  const s = createShellState();
  const { state, effect } = run(s, "   ");
  assert.deepEqual(state.lines, []);
  assert.deepEqual(state.history, []);
  assert.deepEqual(effect, { kind: "none" });
});

test("runCommand: echoes prompt+input as the first line, then the command's own output", () => {
  const s = createShellState();
  const { state } = run(s, "whoami");
  assert.equal(state.lines[0].text, "shev@edith:~/shevinum.dev $ whoami");
  assert.equal(state.lines[0].kind, "input");
  assert.equal(state.lines[1].text, "shev");
  assert.equal(state.history[0], "whoami");
  assert.equal(state.input, "");
});

test("runCommand: cd changes cwd and reflects in the next prompt", () => {
  const s = createShellState();
  const { state } = run(s, "cd src/lib");
  assert.deepEqual(state.cwd, ["src", "lib"]);
});

test("runCommand: cd into a missing path reports the error and leaves cwd unchanged", () => {
  const s = createShellState();
  const { state } = run(s, "cd nope");
  assert.deepEqual(state.cwd, []);
  assert.equal(state.lines[1].kind, "error");
  assert.match(state.lines[1].text, /no such file or directory/);
});

test("runCommand: ls lists the cwd, dirs suffixed with /", () => {
  const s = createShellState();
  const { state } = run(s, "ls");
  const printed = state.lines.slice(1).map((l) => l.text);
  assert.deepEqual(printed, ["repos/", "src/", "package.json", "README.md"]);
});

test("runCommand: pwd prints the home label plus the cwd suffix", () => {
  let s = createShellState();
  s = run(s, "cd src").state;
  const { state } = run(s, "pwd");
  assert.equal(state.lines.at(-1)?.text, "~/shevinum.dev/src");
});

test("runCommand: cat a site file resolves content via ctx.resolveContent", () => {
  const s = createShellState();
  const { state } = run(s, "cat package.json", {
    resolveContent: (t) => (t.kind === "site" && t.path === "package.json" ? "line one\nline two" : undefined),
  });
  const printed = state.lines.slice(1).map((l) => l.text);
  assert.deepEqual(printed, ["line one", "line two"]);
});

test("runCommand: cat a repos/<name>/ file resolves via the repo branch", () => {
  const s = createShellState();
  const { state } = run(s, "cat repos/Sheldon/README.md", {
    resolveContent: (t) => (t.kind === "repo" && t.repo === "Sheldon" ? "# Sheldon" : undefined),
  });
  assert.equal(state.lines.at(-1)?.text, "# Sheldon");
});

test("runCommand: cat reports missing/dir/unindexed distinctly", () => {
  const s = createShellState();
  assert.match(run(s, "cat nope").state.lines.at(-1)!.text, /No such file or directory/);
  assert.match(run(s, "cat src").state.lines.at(-1)!.text, /Is a directory/);
  assert.match(run(s, "cat package.json").state.lines.at(-1)!.text, /binary or unindexed/);
  assert.equal(run(s, "cat").state.lines.at(-1)!.text, "cat: missing operand");
});

test("runCommand: tree renders from the cwd", () => {
  const { state } = run(createShellState(), "tree");
  assert.equal(state.lines[1].text, ".");
});

test("runCommand: clear empties the scrollback entirely (no echo survives)", () => {
  let s = createShellState();
  s = run(s, "whoami").state;
  assert.ok(s.lines.length > 0);
  s = run(s, "clear").state;
  assert.deepEqual(s.lines, []);
});

test("runCommand: help prints the intro then one row per builtin", () => {
  const { state } = run(createShellState(), "help");
  assert.equal(state.lines[1].text, "builtins:");
  assert.match(state.lines[2].text, /cd <path>/);
});

test("runCommand: view-names lists the six canonical programs", () => {
  const { state } = run(createShellState(), "view-names");
  assert.equal(state.lines.at(-1)?.text, "available views: dashboard builds personnel retina-v profile help");
});

test("runCommand: neofetch's uptime derives from ctx.nowMs - session.createdAt, never a hidden clock read", () => {
  const { state } = run(createShellState(), "neofetch", {
    session: { name: "x", windowCount: 1, createdAt: 0, attached: true },
    nowMs: 5 * 60_000,
  });
  assert.ok(state.lines.some((l) => l.text === "Uptime: 5 min"));
});

test("runCommand: sudo prints the exact joke as an error line", () => {
  const { state } = run(createShellState(), "sudo rm -rf /");
  assert.equal(state.lines.at(-1)?.text, "shev is not in the sudoers file. This incident will be reported to D.O.O.M.");
});

test("runCommand: open <view> launches that program; an invalid target errors", () => {
  const ok = run(createShellState(), "open builds");
  assert.deepEqual(ok.effect, { kind: "launch", program: "builds" });
  const bad = run(createShellState(), "open nonsense");
  assert.deepEqual(bad.effect, { kind: "none" });
  assert.match(bad.state.lines.at(-1)!.text, /command not found/);
});

test("runCommand: a bare view name (no args) launches it in-pane, same as open", () => {
  const { effect } = run(createShellState(), "dashboard");
  assert.deepEqual(effect, { kind: "launch", program: "dashboard" });
});

test("runCommand: a bare view name WITH an argument is not special-cased — command not found", () => {
  const { state, effect } = run(createShellState(), "dashboard extra");
  assert.deepEqual(effect, { kind: "none" });
  assert.match(state.lines.at(-1)!.text, /command not found/);
});

test("runCommand: exit returns the exit-pane effect", () => {
  const { effect } = run(createShellState(), "exit");
  assert.deepEqual(effect, { kind: "exit-pane" });
});

test("runCommand: reboot returns the reboot effect", () => {
  const { effect } = run(createShellState(), "reboot");
  assert.deepEqual(effect, { kind: "reboot" });
});

test("runCommand: tmux ls lists EVERY session in the roster, each with its own attached flag", () => {
  const testCreatedAt = 1_700_000_000_000;
  const { state } = run(createShellState(), "tmux ls", {
    sessions: [
      { ...DEFAULT_SESSION, createdAt: Date.UTC(2026, 7, 17, 23, 34, 0), attached: true },
      { ...DEFAULT_SESSION, id: "session:test", name: "test", windowCount: 1, createdAt: testCreatedAt, attached: false, windowIds: ["w0"] },
    ],
  });
  const lines = state.lines.slice(1).map((l) => l.text);
  assert.match(lines[0], /^10\.42\.7\.13: 6 windows \(created .+\) \(attached\)$/);
  assert.equal(lines[1], `test: 1 windows (created ${formatCtime(new Date(testCreatedAt))})`);
});

test("runCommand: tmux ls works from a pane (not gated by mode)", () => {
  const { state } = run(createShellState(), "tmux ls", { mode: "pane" });
  assert.match(state.lines.at(-1)!.text, /^10\.42\.7\.13:/);
});

test("runCommand: tmux ls with an empty roster prints 'no sessions'", () => {
  const { state } = run(createShellState(), "tmux ls", { sessions: [] });
  assert.equal(state.lines.at(-1)?.text, "no sessions");
});

test("runCommand: tmux new/a/attach inside a pane refuse with the exact nesting message", () => {
  for (const sub of ["new", "a", "attach"]) {
    const { state } = run(createShellState(), `tmux ${sub}`);
    assert.equal(state.lines.at(-1)?.text, "sessions should be nested with care, unset $TMUX to force");
  }
});

test("runCommand: tmux with an unrecognized subcommand shows a usage error", () => {
  const { state } = run(createShellState(), "tmux bogus");
  assert.equal(state.lines.at(-1)?.text, "usage: tmux bogus");
});

// ---------------------------------------------------------------------
// Sessions (PLAN.md Iteration 3 Phase 5 items 5.1/5.2)
// ---------------------------------------------------------------------

test("nextNumericSessionName: picks the first free positive integer", () => {
  assert.equal(nextNumericSessionName([]), "1");
  assert.equal(nextNumericSessionName(["10.42.7.13"]), "1");
  assert.equal(nextNumericSessionName(["1", "2"]), "3");
  assert.equal(nextNumericSessionName(["2", "1"]), "3");
  assert.equal(nextNumericSessionName(["1", "3"]), "2"); // fills the gap
});

test("seedHostNarrative: substitutes {session} in every row, keeping kind", () => {
  const lines = seedHostNarrative(SHELL, "10.42.7.13");
  assert.equal(lines[0].text, "E.D.I.T.H shell · zsh 5.9 · session 10.42.7.13");
  assert.equal(lines[0].kind, "output");
  assert.equal(lines[1].text, "shev@edith:~/shevinum.dev git:(main) $ tmux new -s 10.42.7.13");
  assert.equal(lines[1].kind, "input");
});

test("runCommand: tmux new (bare, host mode) creates the next numeric session name", () => {
  const { effect } = run(createShellState(), "tmux new", { mode: "host", sessions: [DEFAULT_SESSION] });
  assert.deepEqual(effect, { kind: "create-and-attach", name: "1" });
});

test("runCommand: tmux new -s <name> (host mode) creates that exact name", () => {
  const { effect } = run(createShellState(), "tmux new -s test", { mode: "host" });
  assert.deepEqual(effect, { kind: "create-and-attach", name: "test" });
});

test("runCommand: tmux new -s <duplicate name> (host mode) errors — exact fidelity string", () => {
  const { state, effect } = run(createShellState(), "tmux new -s 10.42.7.13", { mode: "host" });
  assert.deepEqual(effect, { kind: "none" });
  assert.equal(state.lines.at(-1)?.text, "duplicate session: 10.42.7.13");
});

test("runCommand: tmux new -s with no name argument is a usage error, not a silent fallback to auto-numeric", () => {
  const { state, effect } = run(createShellState(), "tmux new -s", { mode: "host" });
  assert.deepEqual(effect, { kind: "none" });
  assert.equal(state.lines.at(-1)?.text, "usage: tmux new");
});

test("runCommand: tmux a (bare, host mode) attaches the most-recently-used session, not merely the first", () => {
  const older: SessionRosterEntry = { ...DEFAULT_SESSION, id: "s-older", name: "older", lastAttachedSeq: 1 };
  const newer: SessionRosterEntry = { ...DEFAULT_SESSION, id: "s-newer", name: "newer", lastAttachedSeq: 5 };
  const { effect } = run(createShellState(), "tmux a", { mode: "host", sessions: [older, newer] });
  assert.deepEqual(effect, { kind: "attach", sessionId: "s-newer" });
});

test("runCommand: tmux a (bare, host mode) with no sessions at all errors — exact fidelity string", () => {
  const { state, effect } = run(createShellState(), "tmux a", { mode: "host", sessions: [] });
  assert.deepEqual(effect, { kind: "none" });
  assert.equal(state.lines.at(-1)?.text, "no sessions");
});

test("runCommand: tmux a -t <name> (host mode) attaches that exact session", () => {
  const { effect } = run(createShellState(), "tmux a -t 10.42.7.13", { mode: "host" });
  assert.deepEqual(effect, { kind: "attach", sessionId: DEFAULT_SESSION.id });
});

test("runCommand: tmux a -t <missing name> (host mode) errors — exact fidelity string", () => {
  const { state, effect } = run(createShellState(), "tmux a -t nope", { mode: "host" });
  assert.deepEqual(effect, { kind: "none" });
  assert.equal(state.lines.at(-1)?.text, "can't find session: nope");
});

test("runCommand: open <view> in host mode attaches the default session and selects that window when it exists", () => {
  const { effect } = run(createShellState(), "open builds", { mode: "host" });
  assert.deepEqual(effect, { kind: "attach-view", sessionId: DEFAULT_SESSION.id, view: "builds", windowExists: true });
});

test("runCommand: open <view> in host mode still attaches when the window was killed, flagging windowExists false", () => {
  const gone: SessionRosterEntry = { ...DEFAULT_SESSION, windowIds: ["dashboard"] };
  const { effect } = run(createShellState(), "open builds", { mode: "host", sessions: [gone] });
  assert.deepEqual(effect, { kind: "attach-view", sessionId: gone.id, view: "builds", windowExists: false });
});

test("runCommand: open <view> in host mode errors when the default session no longer exists at all", () => {
  const { state, effect } = run(createShellState(), "open builds", { mode: "host", sessions: [] });
  assert.deepEqual(effect, { kind: "none" });
  assert.equal(state.lines.at(-1)?.text, "can't find session: 10.42.7.13");
});

test("runCommand: open <view> in pane mode is UNCHANGED — a plain in-pane launch, never an attach", () => {
  const { effect } = run(createShellState(), "open builds", { mode: "pane" });
  assert.deepEqual(effect, { kind: "launch", program: "builds" });
});

test("runCommand: edith (host mode) attaches the default session at window 0 (dashboard)", () => {
  const { effect } = run(createShellState(), "edith", { mode: "host" });
  assert.deepEqual(effect, { kind: "attach-view", sessionId: DEFAULT_SESSION.id, view: "dashboard", windowExists: true });
});

test("runCommand: edith in pane mode is command-not-found (a pane is already attached)", () => {
  const { state, effect } = run(createShellState(), "edith", { mode: "pane" });
  assert.deepEqual(effect, { kind: "none" });
  assert.equal(state.lines.at(-1)?.text, "edith: command not found");
});

test("runCommand: a bare view name in HOST mode prints the not-attached hint instead of launching", () => {
  const { state, effect } = run(createShellState(), "dashboard", { mode: "host" });
  assert.deepEqual(effect, { kind: "none" });
  assert.equal(state.lines.at(-1)?.text, "not attached — try: tmux a");
});

test("runCommand: an unknown command reports 'command not found'", () => {
  const { state } = run(createShellState(), "frobnicate");
  assert.equal(state.lines.at(-1)?.text, "frobnicate: command not found");
});
