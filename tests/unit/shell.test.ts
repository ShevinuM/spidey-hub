// Unit tests for the pure shell parser/builtins/fs-navigation logic
// — src/lib/shell.ts. No DOM, no fetch: a
// small fixture fs index + a hand-built ShellData-shaped fixture (same
// "structurally equivalent fixture, not the real yaml" convention
// tests/unit/cmdline.test.ts already uses) stand in for the generated
// index and src/data/shell.yaml.
import { expect, test } from "vitest";
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
} from "../../src/lib/shell";
import type { ShellData } from "../../src/lib/data";
import { formatCtime } from "../../src/lib/clock";

const FS: FsEntry[] = [
  { path: "package.json", size: 100 },
  { path: "README.md", size: 200 },
  { path: "src/lib/tmux.ts", size: 300 },
  { path: "src/lib/clock.ts", size: 150 },
  { path: "src/lib/deep/a/b/c.ts", size: 10 },
  { path: "src/components/terminal/Terminal.svelte", size: 400 },
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
    vimMissingArgMessage: "vim: missing file operand",
    vimNoSuchFileTemplate: "vim: {path}: No such file or directory",
    vimIsADirTemplate: "vim: {path}: Is a directory",
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
  editor: {
    modeLabel: "NORMAL",
    modeVisualLabel: "VISUAL",
    modeVisualLineLabel: "VISUAL LINE",
    branch: "⑂ main",
    breadcrumbSeparator: "›",
    closePillLabel: "[:q]",
    tabIcon: "▤",
    topLabel: "Top",
    bottomLabel: "Bot",
    percentTemplate: "{n}%",
    positionTemplate: "{line}:{col}",
    searchPromptGlyph: "/",
    cmdlinePromptGlyph: ":",
    readonlyBellMessage: "E21: Cannot make changes, 'modifiable' is off",
    writeReadonlyMessage: "E45: 'readonly' option is set",
    notAnEditorCommandTemplate: "E492: Not an editor command: {cmd}",
  },
};

const VIEW_NAMES = ["dashboard", "repositories", "employment", "retina-v", "profile", "help"] as const;

const DEFAULT_SESSION: SessionRosterEntry = {
  id: "session-0",
  name: "10.42.7.13",
  windowCount: 6,
  createdAt: 1_723_000_000_000,
  attached: true,
  lastAttachedSeq: 1,
  windowIds: ["dashboard", "repositories", "employment", "retina-v", "profile", "help"],
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
  expect(parseLine("cd   src/lib")).toEqual({ cmd: "cd", args: ["src/lib"] });
  expect(parseLine("pwd")).toEqual({ cmd: "pwd", args: [] });
  expect(parseLine("   ")).toEqual({ cmd: "", args: [] });
});

// ---------------------------------------------------------------------
// resolveSegments
// ---------------------------------------------------------------------

test("resolveSegments: relative descent, '..', '.', and absolute paths", () => {
  expect(resolveSegments([], "src/lib")).toEqual(["src", "lib"]);
  expect(resolveSegments(["src", "lib"], "..")).toEqual(["src"]);
  expect(resolveSegments(["src", "lib"], "../..")).toEqual([]);
  expect(resolveSegments(["src"], "../../../..")).toEqual([]); // never goes negative
  expect(resolveSegments(["src"], "./lib")).toEqual(["src", "lib"]);
  expect(resolveSegments(["src", "lib"], "/README.md")).toEqual(["README.md"]);
});

// ---------------------------------------------------------------------
// kindOf / listDir
// ---------------------------------------------------------------------

test("kindOf: root is always a dir; exact file match; directory prefix; missing", () => {
  expect(kindOf(FS, [])).toBe("dir");
  expect(kindOf(FS, ["package.json"])).toBe("file");
  expect(kindOf(FS, ["src"])).toBe("dir");
  expect(kindOf(FS, ["src", "lib"])).toBe("dir");
  expect(kindOf(FS, ["nope"])).toBe("missing");
});

test("listDir at root: dirs before files, localeCompare name order", () => {
  const rows = listDir(FS, []);
  expect(rows.map((r) => r.name)).toEqual(["repos", "src", "package.json", "README.md"]);
  expect(rows[0].type).toBe("dir");
  expect(rows[2].type).toBe("file");
});

test("listDir descends into a nested directory", () => {
  const rows = listDir(FS, ["src"]);
  expect(rows.map((r) => r.name)).toEqual(["components", "lib"]);
});

test("joinPath round-trips segments", () => {
  expect(joinPath(["src", "lib"])).toBe("src/lib");
  expect(joinPath([])).toBe("");
});

// ---------------------------------------------------------------------
// renderTree
// ---------------------------------------------------------------------

test("renderTree: connectors, and depth cap 3 replaces deeper children with a … marker", () => {
  const lines = renderTree(FS, ["src"]);
  expect(lines[0]).toBe("src");
  expect(lines.some((l) => l.startsWith("├── ") || l.startsWith("└── "))).toBeTruthy();
  // src/lib/deep/a/b/c.ts is 4 levels below src/lib (deep -> a -> b -> c.ts)
  // — capped at depth 3, so "b" (the 3rd level down) shows a … instead of
  // descending into its own child. (Not `.trim() === "…"`: a `…` line's own
  // indent can itself contain a "│" continuation glyph from a sibling still
  // to come, e.g. "    │       …" — trim() only strips actual whitespace,
  // so the marker is asserted with `endsWith` instead.)
  expect(lines.some((l) => l.endsWith("…"))).toBeTruthy();
  expect(!lines.some((l) => l.includes("c.ts"))).toBeTruthy();
});

// ---------------------------------------------------------------------
// resolveCd
// ---------------------------------------------------------------------

test("resolveCd: success into an existing directory", () => {
  const result = resolveCd(FS, [], "src/lib", SHELL.errors);
  expect(result).toEqual({ ok: true, cwd: ["src", "lib"] });
});

test("resolveCd: missing path", () => {
  const result = resolveCd(FS, [], "nope", SHELL.errors);
  expect(result).toEqual({ ok: false, error: "cd: no such file or directory: nope" });
});

test("resolveCd: refuses a file target", () => {
  const result = resolveCd(FS, [], "package.json", SHELL.errors);
  expect(result).toEqual({ ok: false, error: "cd: not a directory: package.json" });
});

// ---------------------------------------------------------------------
// resolveCatTarget
// ---------------------------------------------------------------------

test("resolveCatTarget: a site file resolves to kind 'site'", () => {
  expect(resolveCatTarget(FS, [], "package.json")).toEqual({ kind: "site", path: "package.json" });
});

test("resolveCatTarget: a repos/<name>/... file resolves to kind 'repo'", () => {
  expect(resolveCatTarget(FS, [], "repos/Sheldon/README.md")).toEqual({
    kind: "repo",
    repo: "Sheldon",
    path: "README.md",
  });
});

test("resolveCatTarget: a directory and a missing path", () => {
  expect(resolveCatTarget(FS, [], "src")).toEqual({ kind: "dir" });
  expect(resolveCatTarget(FS, [], "nope")).toEqual({ kind: "missing" });
});

// ---------------------------------------------------------------------
// formatPrompt
// ---------------------------------------------------------------------

test("formatPrompt: pane mode reflects cwd; host mode ignores it", () => {
  expect(formatPrompt("pane", SHELL, [])).toBe("shev@edith:~/shevinum.dev $ ");
  expect(formatPrompt("pane", SHELL, ["src", "lib"])).toBe("shev@edith:~/shevinum.dev/src/lib $ ");
  expect(formatPrompt("host", SHELL, ["src"])).toBe("shev@edith:~/shevinum.dev git:(main) $ ");
});

// ---------------------------------------------------------------------
// History / input editing
// ---------------------------------------------------------------------

test("typeChar/backspace edit input and reset historyIndex", () => {
  let s = createShellState();
  s = typeChar(s, "l");
  s = typeChar(s, "s");
  expect(s.input).toBe("ls");
  s = backspace(s);
  expect(s.input).toBe("l");
});

test("historyUp/historyDown walk backward then forward, restoring the draft", () => {
  let s = createShellState();
  s = { ...s, history: ["pwd", "ls", "whoami"] };
  s = typeChar(s, "w"); // in-progress draft "w"
  s = historyUp(s);
  expect(s.input).toBe("whoami");
  s = historyUp(s);
  expect(s.input).toBe("ls");
  s = historyUp(s);
  expect(s.input).toBe("pwd");
  s = historyUp(s); // clamps at the oldest entry
  expect(s.input).toBe("pwd");
  s = historyDown(s);
  expect(s.input).toBe("ls");
  s = historyDown(s);
  expect(s.input).toBe("whoami");
  s = historyDown(s); // past the newest — restores the pre-browse draft
  expect(s.input).toBe("w");
  expect(s.historyIndex).toBe(null);
});

test("historyUp on an empty history is a no-op", () => {
  const s = createShellState();
  expect(historyUp(s)).toBe(s);
});

// ---------------------------------------------------------------------
// runCommand
// ---------------------------------------------------------------------

test("runCommand: a blank line is a no-op (no echo, no history growth)", () => {
  const s = createShellState();
  const { state, effect } = run(s, "   ");
  expect(state.lines).toEqual([]);
  expect(state.history).toEqual([]);
  expect(effect).toEqual({ kind: "none" });
});

test("runCommand: echoes prompt+input as the first line, then the command's own output", () => {
  const s = createShellState();
  const { state } = run(s, "whoami");
  expect(state.lines[0].text).toBe("shev@edith:~/shevinum.dev $ whoami");
  expect(state.lines[0].kind).toBe("input");
  expect(state.lines[1].text).toBe("shev");
  expect(state.history[0]).toBe("whoami");
  expect(state.input).toBe("");
});

test("runCommand: cd changes cwd and reflects in the next prompt", () => {
  const s = createShellState();
  const { state } = run(s, "cd src/lib");
  expect(state.cwd).toEqual(["src", "lib"]);
});

test("runCommand: cd into a missing path reports the error and leaves cwd unchanged", () => {
  const s = createShellState();
  const { state } = run(s, "cd nope");
  expect(state.cwd).toEqual([]);
  expect(state.lines[1].kind).toBe("error");
  expect(state.lines[1].text).toMatch(/no such file or directory/);
});

test("runCommand: ls lists the cwd, dirs suffixed with /", () => {
  const s = createShellState();
  const { state } = run(s, "ls");
  const printed = state.lines.slice(1).map((l) => l.text);
  expect(printed).toEqual(["repos/", "src/", "package.json", "README.md"]);
});

test("runCommand: pwd prints the home label plus the cwd suffix", () => {
  let s = createShellState();
  s = run(s, "cd src").state;
  const { state } = run(s, "pwd");
  expect(state.lines.at(-1)?.text).toBe("~/shevinum.dev/src");
});

test("runCommand: cat a site file resolves content via ctx.resolveContent", () => {
  const s = createShellState();
  const { state } = run(s, "cat package.json", {
    resolveContent: (t) => (t.kind === "site" && t.path === "package.json" ? "line one\nline two" : undefined),
  });
  const printed = state.lines.slice(1).map((l) => l.text);
  expect(printed).toEqual(["line one", "line two"]);
});

test("runCommand: cat a repos/<name>/ file resolves via the repo branch", () => {
  const s = createShellState();
  const { state } = run(s, "cat repos/Sheldon/README.md", {
    resolveContent: (t) => (t.kind === "repo" && t.repo === "Sheldon" ? "# Sheldon" : undefined),
  });
  expect(state.lines.at(-1)?.text).toBe("# Sheldon");
});

test("runCommand: cat reports missing/dir/unindexed distinctly", () => {
  const s = createShellState();
  expect(run(s, "cat nope").state.lines.at(-1)!.text).toMatch(/No such file or directory/);
  expect(run(s, "cat src").state.lines.at(-1)!.text).toMatch(/Is a directory/);
  expect(run(s, "cat package.json").state.lines.at(-1)!.text).toMatch(/binary or unindexed/);
  expect(run(s, "cat").state.lines.at(-1)!.text).toBe("cat: missing operand");
});

// ---------------------------------------------------------------------
// vim / vi / nvim
// ---------------------------------------------------------------------

test("runCommand: vim <existing file> emits an open-editor effect with the resolved path and fetched content", () => {
  const s = createShellState();
  const { state, effect } = run(s, "vim package.json", {
    resolveContent: (t) => (t.kind === "site" && t.path === "package.json" ? "line one\nline two" : undefined),
  });
  expect(effect).toEqual({ kind: "open-editor", path: "package.json", content: "line one\nline two" });
  // Still echoes the typed command like every other builtin, just no extra
  // printed lines (the content goes to the effect, not the scrollback).
  expect(state.lines.length).toBe(1);
});

test("runCommand: vi/nvim are accepted aliases for vim", () => {
  const s = createShellState();
  const resolveContent = () => "hi";
  expect(run(s, "vi package.json", { resolveContent }).effect.kind).toBe("open-editor");
  expect(run(s, "nvim package.json", { resolveContent }).effect.kind).toBe("open-editor");
});

test("runCommand: vim reports missing/dir/unindexed distinctly, and a bare vim reports a usage error — none of them emit an effect", () => {
  const s = createShellState();
  const missing = run(s, "vim nope");
  expect(missing.state.lines.at(-1)!.text).toMatch(/No such file or directory/);
  expect(missing.effect.kind).toBe("none");

  const dir = run(s, "vim src");
  expect(dir.state.lines.at(-1)!.text).toMatch(/Is a directory/);
  expect(dir.effect.kind).toBe("none");

  const unindexed = run(s, "vim package.json");
  expect(unindexed.state.lines.at(-1)!.text).toMatch(/binary or unindexed/);
  expect(unindexed.effect.kind).toBe("none");

  const noArg = run(s, "vim");
  expect(noArg.state.lines.at(-1)!.text).toBe("vim: missing file operand");
  expect(noArg.effect.kind).toBe("none");
});

test("runCommand: tree renders from the cwd", () => {
  const { state } = run(createShellState(), "tree");
  expect(state.lines[1].text).toBe(".");
});

test("runCommand: clear empties the scrollback entirely (no echo survives)", () => {
  let s = createShellState();
  s = run(s, "whoami").state;
  expect(s.lines.length > 0).toBeTruthy();
  s = run(s, "clear").state;
  expect(s.lines).toEqual([]);
});

test("runCommand: help prints the intro then one row per builtin", () => {
  const { state } = run(createShellState(), "help");
  expect(state.lines[1].text).toBe("builtins:");
  expect(state.lines[2].text).toMatch(/cd <path>/);
});

test("runCommand: view-names lists the six canonical programs", () => {
  const { state } = run(createShellState(), "view-names");
  expect(state.lines.at(-1)?.text).toBe("available views: dashboard repositories employment retina-v profile help");
});

test("runCommand: neofetch's uptime derives from ctx.nowMs - session.createdAt, never a hidden clock read", () => {
  const { state } = run(createShellState(), "neofetch", {
    session: { name: "x", windowCount: 1, createdAt: 0, attached: true },
    nowMs: 5 * 60_000,
  });
  expect(state.lines.some((l) => l.text === "Uptime: 5 min")).toBeTruthy();
});

test("runCommand: sudo prints the exact joke as an error line", () => {
  const { state } = run(createShellState(), "sudo rm -rf /");
  expect(state.lines.at(-1)?.text).toBe("shev is not in the sudoers file. This incident will be reported to D.O.O.M.");
});

test("runCommand: open <view> launches that program; an invalid target errors", () => {
  const ok = run(createShellState(), "open repositories");
  expect(ok.effect).toEqual({ kind: "launch", program: "repositories" });
  const bad = run(createShellState(), "open nonsense");
  expect(bad.effect).toEqual({ kind: "none" });
  expect(bad.state.lines.at(-1)!.text).toMatch(/command not found/);
});

test("runCommand: a bare view name (no args) launches it in-pane, same as open", () => {
  const { effect } = run(createShellState(), "dashboard");
  expect(effect).toEqual({ kind: "launch", program: "dashboard" });
});

test("runCommand: a bare view name WITH an argument is not special-cased — command not found", () => {
  const { state, effect } = run(createShellState(), "dashboard extra");
  expect(effect).toEqual({ kind: "none" });
  expect(state.lines.at(-1)!.text).toMatch(/command not found/);
});

test("runCommand: exit returns the exit-pane effect", () => {
  const { effect } = run(createShellState(), "exit");
  expect(effect).toEqual({ kind: "exit-pane" });
});

test("runCommand: reboot returns the reboot effect", () => {
  const { effect } = run(createShellState(), "reboot");
  expect(effect).toEqual({ kind: "reboot" });
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
  expect(lines[0]).toMatch(/^10\.42\.7\.13: 6 windows \(created .+\) \(attached\)$/);
  expect(lines[1]).toBe(`test: 1 windows (created ${formatCtime(new Date(testCreatedAt))})`);
});

test("runCommand: tmux ls works from a pane (not gated by mode)", () => {
  const { state } = run(createShellState(), "tmux ls", { mode: "pane" });
  expect(state.lines.at(-1)!.text).toMatch(/^10\.42\.7\.13:/);
});

test("runCommand: tmux ls with an empty roster prints 'no sessions'", () => {
  const { state } = run(createShellState(), "tmux ls", { sessions: [] });
  expect(state.lines.at(-1)?.text).toBe("no sessions");
});

test("runCommand: tmux new/a/attach inside a pane refuse with the exact nesting message", () => {
  for (const sub of ["new", "a", "attach"]) {
    const { state } = run(createShellState(), `tmux ${sub}`);
    expect(state.lines.at(-1)?.text).toBe("sessions should be nested with care, unset $TMUX to force");
  }
});

test("runCommand: tmux with an unrecognized subcommand shows a usage error", () => {
  const { state } = run(createShellState(), "tmux bogus");
  expect(state.lines.at(-1)?.text).toBe("usage: tmux bogus");
});

// ---------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------

test("nextNumericSessionName: picks the first free positive integer", () => {
  expect(nextNumericSessionName([])).toBe("1");
  expect(nextNumericSessionName(["10.42.7.13"])).toBe("1");
  expect(nextNumericSessionName(["1", "2"])).toBe("3");
  expect(nextNumericSessionName(["2", "1"])).toBe("3");
  expect(nextNumericSessionName(["1", "3"])).toBe("2"); // fills the gap
});

test("seedHostNarrative: substitutes {session} in every row, keeping kind", () => {
  const lines = seedHostNarrative(SHELL, "10.42.7.13");
  expect(lines[0].text).toBe("E.D.I.T.H shell · zsh 5.9 · session 10.42.7.13");
  expect(lines[0].kind).toBe("output");
  expect(lines[1].text).toBe("shev@edith:~/shevinum.dev git:(main) $ tmux new -s 10.42.7.13");
  expect(lines[1].kind).toBe("input");
});

test("runCommand: tmux new (bare, host mode) creates the next numeric session name", () => {
  const { effect } = run(createShellState(), "tmux new", { mode: "host", sessions: [DEFAULT_SESSION] });
  expect(effect).toEqual({ kind: "create-and-attach", name: "1" });
});

test("runCommand: tmux new -s <name> (host mode) creates that exact name", () => {
  const { effect } = run(createShellState(), "tmux new -s test", { mode: "host" });
  expect(effect).toEqual({ kind: "create-and-attach", name: "test" });
});

test("runCommand: tmux new -s <duplicate name> (host mode) errors — exact fidelity string", () => {
  const { state, effect } = run(createShellState(), "tmux new -s 10.42.7.13", { mode: "host" });
  expect(effect).toEqual({ kind: "none" });
  expect(state.lines.at(-1)?.text).toBe("duplicate session: 10.42.7.13");
});

test("runCommand: tmux new -s with no name argument is a usage error, not a silent fallback to auto-numeric", () => {
  const { state, effect } = run(createShellState(), "tmux new -s", { mode: "host" });
  expect(effect).toEqual({ kind: "none" });
  expect(state.lines.at(-1)?.text).toBe("usage: tmux new");
});

test("runCommand: tmux a (bare, host mode) attaches the most-recently-used session, not merely the first", () => {
  const older: SessionRosterEntry = { ...DEFAULT_SESSION, id: "s-older", name: "older", lastAttachedSeq: 1 };
  const newer: SessionRosterEntry = { ...DEFAULT_SESSION, id: "s-newer", name: "newer", lastAttachedSeq: 5 };
  const { effect } = run(createShellState(), "tmux a", { mode: "host", sessions: [older, newer] });
  expect(effect).toEqual({ kind: "attach", sessionId: "s-newer" });
});

test("runCommand: tmux a (bare, host mode) with no sessions at all errors — exact fidelity string", () => {
  const { state, effect } = run(createShellState(), "tmux a", { mode: "host", sessions: [] });
  expect(effect).toEqual({ kind: "none" });
  expect(state.lines.at(-1)?.text).toBe("no sessions");
});

test("runCommand: tmux a -t <name> (host mode) attaches that exact session", () => {
  const { effect } = run(createShellState(), "tmux a -t 10.42.7.13", { mode: "host" });
  expect(effect).toEqual({ kind: "attach", sessionId: DEFAULT_SESSION.id });
});

test("runCommand: tmux a -t <missing name> (host mode) errors — exact fidelity string", () => {
  const { state, effect } = run(createShellState(), "tmux a -t nope", { mode: "host" });
  expect(effect).toEqual({ kind: "none" });
  expect(state.lines.at(-1)?.text).toBe("can't find session: nope");
});

test("runCommand: open <view> in host mode attaches the default session and selects that window when it exists", () => {
  const { effect } = run(createShellState(), "open repositories", { mode: "host" });
  expect(effect).toEqual({ kind: "attach-view", sessionId: DEFAULT_SESSION.id, view: "repositories", windowExists: true });
});

test("runCommand: open <view> in host mode still attaches when the window was killed, flagging windowExists false", () => {
  const gone: SessionRosterEntry = { ...DEFAULT_SESSION, windowIds: ["dashboard"] };
  const { effect } = run(createShellState(), "open repositories", { mode: "host", sessions: [gone] });
  expect(effect).toEqual({ kind: "attach-view", sessionId: gone.id, view: "repositories", windowExists: false });
});

test("runCommand: open <view> in host mode errors when the default session no longer exists at all", () => {
  const { state, effect } = run(createShellState(), "open repositories", { mode: "host", sessions: [] });
  expect(effect).toEqual({ kind: "none" });
  expect(state.lines.at(-1)?.text).toBe("can't find session: 10.42.7.13");
});

test("runCommand: open <view> in pane mode is UNCHANGED — a plain in-pane launch, never an attach", () => {
  const { effect } = run(createShellState(), "open repositories", { mode: "pane" });
  expect(effect).toEqual({ kind: "launch", program: "repositories" });
});

test("runCommand: edith (host mode) attaches the default session at window 0 (dashboard)", () => {
  const { effect } = run(createShellState(), "edith", { mode: "host" });
  expect(effect).toEqual({ kind: "attach-view", sessionId: DEFAULT_SESSION.id, view: "dashboard", windowExists: true });
});

test("runCommand: edith in pane mode is command-not-found (a pane is already attached)", () => {
  const { state, effect } = run(createShellState(), "edith", { mode: "pane" });
  expect(effect).toEqual({ kind: "none" });
  expect(state.lines.at(-1)?.text).toBe("edith: command not found");
});

test("runCommand: a bare view name in HOST mode prints the not-attached hint instead of launching", () => {
  const { state, effect } = run(createShellState(), "dashboard", { mode: "host" });
  expect(effect).toEqual({ kind: "none" });
  expect(state.lines.at(-1)?.text).toBe("not attached — try: tmux a");
});

test("runCommand: an unknown command reports 'command not found'", () => {
  const { state } = run(createShellState(), "frobnicate");
  expect(state.lines.at(-1)?.text).toBe("frobnicate: command not found");
});
