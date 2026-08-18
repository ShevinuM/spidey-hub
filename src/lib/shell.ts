// Pure line-parser/builtins/fs-navigation logic for the in-window shell
// (PLAN.md Iteration 3 Phase 4 items 4.2/4.3) — src/components/Shell.svelte
// owns the stateful/effectful parts (keydown handling, the lazy fetch+cache
// of the generated fs/grep/repo indexes, calling into src/lib/tmux.ts to
// launch/exit a program or reboot the client), exactly the same split
// src/lib/cmdline.ts already uses for Cmdline.svelte. No DOM, no Svelte
// state, no fetch — every builtin below is a pure function of (state,
// already-resolved data) so it's unit-testable against a small fixture fs
// index with no network/browser involved.
//
// Deliberately designed so this ONE component/module serves BOTH the
// per-pane in-window shell (Phase 4, `mode: "pane"`) and Phase 5's detached
// HOST shell (`mode: "host"`) without rework — every function below already
// takes `mode` where it matters (the prompt, and the `tmux` builtin's
// nesting-refusal rule), even though only "pane" is reachable yet.
import type { ShellData } from "./data.ts";
import { formatCtime } from "./clock.ts";

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

export type ShellLineKind = "input" | "output" | "error";

export interface ShellLine {
  text: string;
  kind: ShellLineKind;
}

/** Lives inside a tmux.ts `Pane` (PLAN.md advisor guidance: shell buffers
 * must survive switching away from and back to a window — only `reboot()`/
 * a page reload resets them, exactly like a real tmux pane's scrollback).
 * `cwd` is a segment array (posix path components, `[]` = the fs root) —
 * never a raw string, so `..`/`.`/double-slash normalization has one home
 * (`resolveCd` below). */
export interface ShellState {
  cwd: string[];
  input: string;
  history: string[];
  /** `null` = not currently browsing history (viewing live `input`); an
   * index into `history` otherwise. */
  historyIndex: number | null;
  /** The in-progress `input` text at the moment Up first started browsing
   * history — restored once Down arrows back past the newest entry. */
  draftBeforeHistory: string;
  lines: ShellLine[];
}

export function createShellState(): ShellState {
  return { cwd: [], input: "", history: [], historyIndex: null, draftBeforeHistory: "", lines: [] };
}

// ---------------------------------------------------------------------
// Line parsing (PLAN.md Locked decision #16: no pipes/redirection/
// globbing — a plain whitespace split is the whole grammar).
// ---------------------------------------------------------------------

export interface ParsedLine {
  cmd: string;
  args: string[];
}

export function parseLine(line: string): ParsedLine {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  return { cmd: parts[0] ?? "", args: parts.slice(1) };
}

// ---------------------------------------------------------------------
// fs-index navigation — a FLAT {path, size?}[] list (same shape convention
// as src/lib/repoTree.ts's RepoFile / src/lib/grep.ts's RepoFile: this
// module stays a zero-Svelte-dependency pure module, so it declares its own
// structurally-equivalent type rather than importing theirs). `size` is
// absent for `repos/*` entries (PLAN.md Architecture notes: those subtrees
// are "paths only", taken from the per-repo index JSONs without an extra
// byte-size pass).
// ---------------------------------------------------------------------

export interface FsEntry {
  path: string;
  size?: number;
}

export function joinPath(segments: string[]): string {
  return segments.join("/");
}

/** Resolves `argPath` (relative or, with a leading "/", absolute) against
 * `cwd` into a fresh segment array — `.`/`..`/empty segments collapse,
 * `..` past the root simply stops at the root (real shells do the same). */
export function resolveSegments(cwd: string[], argPath: string): string[] {
  const isAbsolute = argPath.startsWith("/");
  const base = isAbsolute ? [] : [...cwd];
  for (const part of argPath.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      base.pop();
      continue;
    }
    base.push(part);
  }
  return base;
}

export type FsKind = "dir" | "file" | "missing";

/** The root (`segments.length === 0`) always exists and is always a
 * directory — the fs-index has no explicit root record, so this is checked
 * before ever consulting `entries`. */
export function kindOf(entries: FsEntry[], segments: string[]): FsKind {
  if (segments.length === 0) return "dir";
  const path = joinPath(segments);
  if (entries.some((e) => e.path === path)) return "file";
  const prefix = `${path}/`;
  if (entries.some((e) => e.path.startsWith(prefix))) return "dir";
  return "missing";
}

export interface DirEntry {
  type: "dir" | "file";
  name: string;
  size?: number;
}

/** Immediate children of `segments`, directories before files, then
 * case-insensitive name — same convention as src/lib/repoTree.ts's
 * `listDir` (ported locally rather than imported — see file header). */
export function listDir(entries: FsEntry[], segments: string[]): DirEntry[] {
  const prefix = segments.length === 0 ? "" : `${joinPath(segments)}/`;
  const seen = new Map<string, DirEntry>();
  for (const e of entries) {
    if (!e.path.startsWith(prefix)) continue;
    const rest = e.path.slice(prefix.length);
    if (rest === "") continue;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      seen.set(rest, { type: "file", name: rest, size: e.size });
    } else {
      const dirName = rest.slice(0, slash);
      if (!seen.has(dirName)) seen.set(dirName, { type: "dir", name: dirName });
    }
  }
  return [...seen.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** `tree`(1)-style ASCII rendering of `segments` and its descendants, capped
 * at `maxDepth` levels of directory listing beyond `segments` itself — a
 * directory at the cap is listed but its OWN children are replaced by a
 * single `…` marker rather than descended into (PLAN.md Architecture
 * notes). Root label is `.` at the fs root, else the cwd's own last
 * segment (matching real `tree`'s own "argument you gave it" label). */
export function renderTree(entries: FsEntry[], segments: string[], maxDepth = 3): string[] {
  const rootLabel = segments.length === 0 ? "." : segments[segments.length - 1];
  const lines = [rootLabel];

  function walk(at: string[], depth: number, indent: string) {
    const children = listDir(entries, at);
    children.forEach((child, i) => {
      const isLast = i === children.length - 1;
      const connector = isLast ? "└── " : "├── ";
      lines.push(indent + connector + child.name + (child.type === "dir" ? "/" : ""));
      if (child.type !== "dir") return;
      const childIndent = indent + (isLast ? "    " : "│   ");
      if (depth + 1 >= maxDepth) {
        lines.push(`${childIndent}…`);
      } else {
        walk([...at, child.name], depth + 1, childIndent);
      }
    });
  }

  walk(segments, 0, "");
  return lines;
}

export type CdResult = { ok: true; cwd: string[] } | { ok: false; error: string };

export function resolveCd(entries: FsEntry[], cwd: string[], argPath: string | undefined, errors: ShellData["errors"]): CdResult {
  const target = argPath ? resolveSegments(cwd, argPath) : [];
  const kind = kindOf(entries, target);
  if (kind === "missing") return { ok: false, error: errors.cdNoSuchDirTemplate.replace("{path}", argPath ?? "") };
  if (kind === "file") return { ok: false, error: errors.cdNotADirTemplate.replace("{path}", argPath ?? "") };
  return { ok: true, cwd: target };
}

/** Where `cat <argPath>` (resolved against `cwd`) should pull content
 * from — a decision the (impure) caller makes BEFORE fetching anything, so
 * it knows whether to warm the grep index or a specific repo index (PLAN.md
 * Architecture notes: "site files from the grep index, repos/<name>/ files
 * from repo index JSONs"). Pure — depends only on the fs-index structure,
 * never on whether content has actually been fetched yet. */
export type CatTarget =
  | { kind: "site"; path: string }
  | { kind: "repo"; repo: string; path: string }
  | { kind: "dir" }
  | { kind: "missing" };

export function resolveCatTarget(entries: FsEntry[], cwd: string[], argPath: string): CatTarget {
  const segments = resolveSegments(cwd, argPath);
  const kind = kindOf(entries, segments);
  if (kind === "missing") return { kind: "missing" };
  if (kind === "dir") return { kind: "dir" };
  if (segments[0] === "repos" && segments.length >= 3) {
    return { kind: "repo", repo: segments[1], path: segments.slice(2).join("/") };
  }
  return { kind: "site", path: joinPath(segments) };
}

// ---------------------------------------------------------------------
// History / input editing — driven by keydowns directly (Up/Down/
// Backspace/printable), not by `runCommand` (which only ever runs on
// Enter).
// ---------------------------------------------------------------------

export function typeChar(state: ShellState, ch: string): ShellState {
  return { ...state, input: state.input + ch, historyIndex: null };
}

export function backspace(state: ShellState): ShellState {
  return { ...state, input: state.input.slice(0, -1), historyIndex: null };
}

export function historyUp(state: ShellState): ShellState {
  if (state.history.length === 0) return state;
  if (state.historyIndex === null) {
    const idx = state.history.length - 1;
    return { ...state, historyIndex: idx, draftBeforeHistory: state.input, input: state.history[idx] };
  }
  const idx = Math.max(0, state.historyIndex - 1);
  return { ...state, historyIndex: idx, input: state.history[idx] };
}

export function historyDown(state: ShellState): ShellState {
  if (state.historyIndex === null) return state;
  if (state.historyIndex >= state.history.length - 1) {
    return { ...state, historyIndex: null, input: state.draftBeforeHistory };
  }
  const idx = state.historyIndex + 1;
  return { ...state, historyIndex: idx, input: state.history[idx] };
}

// ---------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------

export type ShellMode = "pane" | "host";

/** `{path}` is "" at the fs root, else "/" + the cwd's segments joined —
 * host mode ignores `cwd` entirely (real tmux's own detached host shell has
 * no notion of "the site's fs", only the mock's own fixed prompt). */
export function formatPrompt(mode: ShellMode, shell: ShellData, cwd: string[]): string {
  if (mode === "host") return shell.prompt.hostTemplate;
  const path = cwd.length === 0 ? "" : `/${joinPath(cwd)}`;
  return shell.prompt.paneTemplate.replace("{path}", path);
}

// ---------------------------------------------------------------------
// runCommand — the Enter-key dispatcher
// ---------------------------------------------------------------------

export interface SessionSummary {
  name: string;
  windowCount: number;
  createdAt: number;
  attached: boolean;
}

export interface RunContext {
  fsEntries: FsEntry[];
  /** Already-warmed content lookup for `cat` — the (impure) caller resolves
   * `resolveCatTarget` FIRST, fetches whatever that implies (the grep index
   * or one repo index), and only then calls `runCommand` with this filled
   * in; `undefined` means "structurally a file, but no captured text
   * content" (binary, over the size cap, or simply never walked — PLAN.md
   * Architecture notes' `cat: {path}: binary or unindexed`). This function
   * never fetches anything itself. */
  resolveContent: (target: CatTarget) => string | undefined;
  mode: ShellMode;
  /** Real "now", supplied by the caller (`Date.now()` — or a Playwright-
   * frozen clock under test) so this module never calls `Date.now()`
   * itself (determinism rules: every timestamp flows through an explicit
   * parameter, never a hidden global read). */
  nowMs: number;
  session: SessionSummary;
  shell: ShellData;
  /** The six canonical program names — bare-command validation for `open`/
   * relaunch-by-name (PLAN.md Architecture notes). */
  viewNames: readonly string[];
}

export type ShellEffect =
  | { kind: "none" }
  | { kind: "launch"; program: string }
  | { kind: "exit-pane" }
  | { kind: "reboot" };

export interface RunOutcome {
  state: ShellState;
  effect: ShellEffect;
}

function formatUptime(shell: ShellData, fromMs: number, toMs: number): string {
  const mins = Math.max(0, Math.floor((toMs - fromMs) / 60000));
  return shell.neofetch.uptimeTemplate.replace("{mins}", String(mins));
}

/** Runs one submitted (Enter-pressed) line. Always echoes the prompt+typed
 * text as the first appended line (even for an empty/unknown command —
 * real shells echo nothing extra for a bare Enter, handled by the early
 * return below skipping the echo entirely for a wholly-blank line, matching
 * "a bare Enter does nothing visible"). History only grows for a
 * non-blank line (`pushHistory` below). */
export function runCommand(state: ShellState, rawLine: string, ctx: RunContext): RunOutcome {
  const trimmedForHistory = rawLine.trim();
  if (trimmedForHistory === "") {
    return { state: { ...state, input: "", historyIndex: null, draftBeforeHistory: "" }, effect: { kind: "none" } };
  }

  const echoed: ShellLine = { text: formatPrompt(ctx.mode, ctx.shell, state.cwd) + rawLine, kind: "input" };
  const base: ShellState = {
    ...state,
    history: [...state.history, trimmedForHistory],
    historyIndex: null,
    draftBeforeHistory: "",
    input: "",
    lines: [...state.lines, echoed],
  };
  const { cmd, args } = parseLine(trimmedForHistory);

  const out = (extra: ShellLine[], patch: Partial<ShellState> = {}): RunOutcome => ({
    state: { ...base, ...patch, lines: [...base.lines, ...extra] },
    effect: { kind: "none" },
  });
  const errLine = (text: string): ShellLine => ({ text, kind: "error" });
  const outLine = (text: string): ShellLine => ({ text, kind: "output" });

  switch (cmd) {
    case "cd": {
      const result = resolveCd(ctx.fsEntries, base.cwd, args[0], ctx.shell.errors);
      if (!result.ok) return out([errLine(result.error)]);
      return out([], { cwd: result.cwd });
    }

    case "ls": {
      const target = args[0] ? resolveSegments(base.cwd, args[0]) : base.cwd;
      const kind = kindOf(ctx.fsEntries, target);
      if (kind === "missing") {
        return out([errLine(ctx.shell.errors.lsNoSuchTemplate.replace("{path}", args[0] ?? ""))]);
      }
      if (kind === "file") {
        return out([outLine(target[target.length - 1] ?? "")]);
      }
      const rows = listDir(ctx.fsEntries, target).map((e) => e.name + (e.type === "dir" ? "/" : ""));
      return out(rows.map(outLine));
    }

    case "cat": {
      if (!args[0]) return out([errLine(ctx.shell.errors.catMissingArgMessage)]);
      const target = resolveCatTarget(ctx.fsEntries, base.cwd, args[0]);
      if (target.kind === "missing") return out([errLine(ctx.shell.errors.catNoSuchFileTemplate.replace("{path}", args[0]))]);
      if (target.kind === "dir") return out([errLine(ctx.shell.errors.catIsADirTemplate.replace("{path}", args[0]))]);
      const content = ctx.resolveContent(target);
      if (content === undefined) return out([errLine(ctx.shell.errors.catUnindexedTemplate.replace("{path}", args[0]))]);
      return out(content.split("\n").map(outLine));
    }

    case "pwd": {
      const path = base.cwd.length === 0 ? "" : `/${joinPath(base.cwd)}`;
      return out([outLine(ctx.shell.homeLabel + path)]);
    }

    case "tree":
      return out(renderTree(ctx.fsEntries, base.cwd).map(outLine));

    case "clear":
      return { state: { ...base, lines: [] }, effect: { kind: "none" } };

    case "whoami":
      return out([outLine(ctx.shell.whoami)]);

    case "help":
      return out([outLine(ctx.shell.help.intro), ...ctx.shell.help.rows.map((r) => outLine(`  ${r.cmd} — ${r.description}`))]);

    case "view-names":
      return out([outLine(`${ctx.shell.viewNames.label} ${ctx.viewNames.join(" ")}`)]);

    case "neofetch": {
      const fields = ctx.shell.neofetch.fields.map((f) => outLine(`${f.label}: ${f.value}`));
      const uptime = outLine(`${ctx.shell.neofetch.uptimeLabel}: ${formatUptime(ctx.shell, ctx.session.createdAt, ctx.nowMs)}`);
      return out([...ctx.shell.neofetch.art.map(outLine), ...fields, uptime]);
    }

    case "sudo":
      return out([errLine(ctx.shell.sudo.message)]);

    case "open": {
      const target = args[0];
      if (!target || !ctx.viewNames.includes(target)) {
        return out([errLine(ctx.shell.errors.commandNotFoundTemplate.replace("{cmd}", cmd))]);
      }
      return { state: base, effect: { kind: "launch", program: target } };
    }

    case "exit":
      return { state: base, effect: { kind: "exit-pane" } };

    case "reboot":
      return { state: base, effect: { kind: "reboot" } };

    case "tmux": {
      const sub = args[0];
      if (sub === "ls") {
        const row = ctx.shell.tmux.lsRowTemplate
          .replace("{name}", ctx.session.name)
          .replace("{n}", String(ctx.session.windowCount))
          .replace("{ctime}", formatCtime(new Date(ctx.session.createdAt)));
        const suffix = ctx.session.attached ? ctx.shell.tmux.lsAttachedSuffix : "";
        return out([outLine(row + suffix)]);
      }
      if (sub === "new" || sub === "a" || sub === "attach") {
        // PLAN.md tmux fidelity reference: inside a pane shell, new/attach
        // always refuse — real tmux nesting protection. Host mode's own
        // working new/attach lands in Phase 5.
        return out([errLine(ctx.shell.errors.nestedTmuxMessage)]);
      }
      return out([errLine(ctx.shell.errors.tmuxUnknownSubcommandTemplate.replace("{cmd}", sub ?? ""))]);
    }

    default:
      if (ctx.viewNames.includes(cmd) && args.length === 0) {
        return { state: base, effect: { kind: "launch", program: cmd } };
      }
      return out([errLine(ctx.shell.errors.commandNotFoundTemplate.replace("{cmd}", cmd))]);
  }
}
