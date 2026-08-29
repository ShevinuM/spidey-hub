// Pure line-parser/builtins/fs-navigation logic for the in-window shell —
// src/components/Shell.svelte owns the stateful/effectful parts (keydown
// handling, the lazy fetch+cache of the generated fs/grep/repo indexes,
// calling into src/common/engines/tmux/tmux.ts to launch/exit a program or reboot the
// client), exactly the same split src/common/lib/cmdline.ts already uses for
// Cmdline.svelte. No DOM, no Svelte state, no fetch — every builtin below is
// a pure function of (state, already-resolved data) so it's unit-testable
// against a small fixture fs index with no network/browser involved.
//
// Deliberately designed so this ONE component/module serves BOTH the
// per-pane in-window shell (`mode: "pane"`) and the detached HOST shell
// (`mode: "host"`) without rework — every function below already takes
// `mode` where it matters (the prompt, and the `tmux` builtin's
// nesting-refusal rule).
import type { ShellData } from "../common/lib/data";
import { formatCtime } from "../common/lib/clock";

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

export type ShellLineKind = "input" | "output" | "error";

export interface ShellLine {
  text: string;
  kind: ShellLineKind;
}

/** Lives inside a tmux.ts `Pane`: shell buffers must survive switching away
 * from and back to a window — only `reboot()`/a page reload resets them,
 * exactly like a real tmux pane's scrollback.
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
// Line parsing — no pipes/redirection/globbing: a plain whitespace split is
// the whole grammar.
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
// absent for `repos/*` entries — those subtrees are paths only, taken from
// the per-repo index JSONs without an extra byte-size pass.
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
  size?: number | undefined;
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
 * single `…` marker rather than descended into. Root label is `.` at the
 * fs root, else the cwd's own last
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
 * it knows whether to warm the grep index or a specific repo index (site
 * files from the grep index, repos/<name>/ files from repo index JSONs).
 * Pure — depends only on the fs-index structure,
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

/** One roster row for `tmux ls`
 * / the `tmux new [-s name]` duplicate check / the `tmux a [-t name]`
 * missing-session check / bare `tmux a`'s "most recently used unattached
 * session" pick / `open <view>`'s "does that window still exist" check.
 * Deliberately its own type (not a re-export of tmux.ts's `Session`) —
 * shell.ts stays a zero-Svelte/zero-tmux.ts-dependency pure module (same
 * "structurally equivalent, not imported" convention `FsEntry` already
 * documents against repoTree.ts/grep.ts) — the (impure) caller builds one
 * of these per live `Session` on every keystroke. */
export interface SessionRosterEntry {
  id: string;
  name: string;
  windowCount: number;
  createdAt: number;
  attached: boolean;
  /** Mirrors tmux.ts's `Session.lastAttachedSeq` — a logical recency
   * counter, NOT a clock read (see that field's own comment on why: a
   * pinned test clock would otherwise collapse every session's timestamp to
   * the same instant). */
  lastAttachedSeq: number;
  /** Every window id currently present in this session — `open <view>`'s
   * "does the target window still exist" check (if the window was killed,
   * attach + message). */
  windowIds: string[];
}

export interface RunContext {
  fsEntries: FsEntry[];
  /** Already-warmed content lookup for `cat` — the (impure) caller resolves
   * `resolveCatTarget` FIRST, fetches whatever that implies (the grep index
   * or one repo index), and only then calls `runCommand` with this filled
   * in; `undefined` means "structurally a file, but no captured text
   * content" (binary, over the size cap, or simply never walked — renders
   * as `cat: {path}: binary or unindexed`). This function
   * never fetches anything itself. */
  resolveContent: (target: CatTarget) => string | undefined;
  mode: ShellMode;
  /** Real "now", supplied by the caller (`Date.now()` — or a Playwright-
   * frozen clock under test) so this module never calls `Date.now()`
   * itself (determinism rules: every timestamp flows through an explicit
   * parameter, never a hidden global read). */
  nowMs: number;
  /** Kept for neofetch's own uptime anchor (`session.createdAt`) — the ONE
   * remaining use of a single "current session" summary now that `tmux ls`
   * (below) reads the full `sessions` roster instead. */
  session: SessionSummary;
  /** Every session the CLIENT
   * currently knows about (attached or not) — `tmux ls`/`new`/`a`/`attach`'s
   * own validation source. Always populated, in both pane and host mode
   * (`tmux ls` works everywhere). */
  sessions: SessionRosterEntry[];
  /** The well-known default session's bare name ("10.42.7.13") — HOST
   * mode's `open <view>`/`edith` builtin always target this specific
   * session by name, never "whichever is most recent". */
  defaultSessionName: string;
  shell: ShellData;
  /** The six canonical program names — bare-command validation for `open`/
   * relaunch-by-name. */
  viewNames: readonly string[];
}

export type ShellEffect =
  | { kind: "none" }
  | { kind: "launch"; program: string }
  | { kind: "exit-pane" }
  | { kind: "reboot" }
  /** `tmux a [-t name]` resolved to an EXISTING session id — the impure
   * caller (Terminal.svelte) performs the actual
   * `attachSession()` mutation. */
  | { kind: "attach"; sessionId: string }
  /** `tmux new [-s name]` — `name` is already fully resolved/validated
   * (explicit `-s` name checked non-duplicate, or the next free numeric
   * name computed) by the time this effect is returned; the caller creates
   * AND immediately attaches (real tmux's own combined behavior for a
   * brand-new session started from outside). */
  | { kind: "create-and-attach"; name: string }
  /** HOST mode's `open <view>` / `edith` builtin — attaches the default
   * session and selects `view`'s window if it still exists
   * (`windowExists`); the caller shows a fallback message instead of a
   * hard navigation when it doesn't (that window was killed at some
   * point). */
  | { kind: "attach-view"; sessionId: string; view: string; windowExists: boolean }
  /** `vim`/`vi`/`nvim <file>`: `path` is the
   * fully-resolved (cwd-joined) display path, `content` its already-
   * fetched text (the caller resolved `resolveCatTarget` and fetched it
   * BEFORE calling `runCommand`, same "pre-warm, then call" convention
   * `cat` already uses). The (impure) caller opens a read-only Editor over
   * this pane, reusing the exact same `editorFile` local-state pattern
   * Repositories.svelte/EmploymentRecords.svelte already use — `:q` there drops back to
   * this shell, never killing the pane. */
  | { kind: "open-editor"; path: string; content: string };

export interface RunOutcome {
  state: ShellState;
  effect: ShellEffect;
}

// ---------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------

/** Bare `tmux new` fidelity rule: "next numeric name (\"1\", \"2\", …)" —
 * the first positive integer (as a string) not already in use by any
 * existing session. Pure — takes the plain name list, never a `Session[]`
 * (module boundary: shell.ts never imports tmux.ts). */
export function nextNumericSessionName(existingNames: string[]): string {
  let n = 1;
  while (existingNames.includes(String(n))) n += 1;
  return String(n);
}

/** Bare `tmux a`/`attach` fidelity rule: "most recently used unattached
 * session" — the highest `lastAttachedSeq` in `sessions`, or `undefined`
 * for an empty roster (`no sessions`, rendered by the caller). Small,
 * deliberate duplicate of tmux.ts's own `pickMostRecentSession` (same
 * one-line sort, different element type) rather than an import — see this
 * file's header comment on why shell.ts never imports tmux.ts. */
function pickMostRecentUnattached(sessions: SessionRosterEntry[]): SessionRosterEntry | undefined {
  return [...sessions].sort((a, b) => b.lastAttachedSeq - a.lastAttachedSeq)[0];
}

/** Builds the detached HOST shell's
 * pre-seeded scrollback from shell.yaml's `host.narrative` rows, with every
 * row's `{session}` placeholder substituted for the real default session
 * name. Pure (no DOM/fetch) so it's callable from both Terminal.svelte (at
 * client-factory/reboot time) and a unit test. */
export function seedHostNarrative(shell: ShellData, sessionName: string): ShellLine[] {
  return shell.host.narrative.map((row) => ({ text: row.text.replace("{session}", sessionName), kind: row.kind }));
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

    // `vim`/`vi`/`nvim <file>`: reuses `cat`'s
    // own path-resolution and content-fetch machinery (same fs index,
    // same `resolveCatTarget`/`ctx.resolveContent` pre-warm convention) —
    // this viewer never writes, so there is nothing else to resolve.
    case "vim":
    case "vi":
    case "nvim": {
      if (!args[0]) return out([errLine(ctx.shell.errors.vimMissingArgMessage)]);
      const target = resolveCatTarget(ctx.fsEntries, base.cwd, args[0]);
      if (target.kind === "missing") return out([errLine(ctx.shell.errors.vimNoSuchFileTemplate.replace("{path}", args[0]))]);
      if (target.kind === "dir") return out([errLine(ctx.shell.errors.vimIsADirTemplate.replace("{path}", args[0]))]);
      const content = ctx.resolveContent(target);
      if (content === undefined) return out([errLine(ctx.shell.errors.catUnindexedTemplate.replace("{path}", args[0]))]);
      const path = joinPath(resolveSegments(base.cwd, args[0]));
      return { state: base, effect: { kind: "open-editor", path, content } };
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
      if (ctx.mode === "host") return attachViewOutcome(base, ctx, target);
      return { state: base, effect: { kind: "launch", program: target } };
    }

    // HOST mode only (the mock's header
    // advertises `edith` to launch the site again); a pane shell has
    // nothing to attach (it's already attached — that's what a pane IS), so
    // it falls through to the ordinary command-not-found case below.
    case "edith": {
      if (ctx.mode !== "host") return out([errLine(ctx.shell.errors.commandNotFoundTemplate.replace("{cmd}", cmd))]);
      return attachViewOutcome(base, ctx, "dashboard");
    }

    case "exit":
      return { state: base, effect: { kind: "exit-pane" } };

    case "reboot":
      return { state: base, effect: { kind: "reboot" } };

    case "tmux": {
      const sub = args[0];
      if (sub === "ls") {
        if (ctx.sessions.length === 0) return out([errLine(ctx.shell.tmux.noSessionsMessage)]);
        const rows = ctx.sessions.map((s) => {
          const row = ctx.shell.tmux.lsRowTemplate
            .replace("{name}", s.name)
            .replace("{n}", String(s.windowCount))
            .replace("{ctime}", formatCtime(new Date(s.createdAt)));
          return row + (s.attached ? ctx.shell.tmux.lsAttachedSuffix : "");
        });
        return out(rows.map(outLine));
      }

      // Inside a pane shell, new/attach
      // always refuse — real tmux nesting protection. `ls` above works
      // everywhere; only these two subcommands are pane-restricted.
      if (sub === "new") {
        if (ctx.mode === "pane") return out([errLine(ctx.shell.errors.nestedTmuxMessage)]);
        if (args.length === 1) {
          const name = nextNumericSessionName(ctx.sessions.map((s) => s.name));
          return { state: base, effect: { kind: "create-and-attach", name } };
        }
        if (args[1] === "-s" && args[2]) {
          const name = args[2];
          if (ctx.sessions.some((s) => s.name === name)) {
            return out([errLine(ctx.shell.tmux.duplicateSessionTemplate.replace("{name}", name))]);
          }
          return { state: base, effect: { kind: "create-and-attach", name } };
        }
        return out([errLine(ctx.shell.errors.tmuxUnknownSubcommandTemplate.replace("{cmd}", "new"))]);
      }
      if (sub === "a" || sub === "attach") {
        if (ctx.mode === "pane") return out([errLine(ctx.shell.errors.nestedTmuxMessage)]);
        if (args.length === 1) {
          const chosen = pickMostRecentUnattached(ctx.sessions);
          if (!chosen) return out([errLine(ctx.shell.tmux.noSessionsMessage)]);
          return { state: base, effect: { kind: "attach", sessionId: chosen.id } };
        }
        if (args[1] === "-t" && args[2]) {
          const name = args[2];
          const found = ctx.sessions.find((s) => s.name === name);
          if (!found) return out([errLine(ctx.shell.tmux.cantFindSessionTemplate.replace("{name}", name))]);
          return { state: base, effect: { kind: "attach", sessionId: found.id } };
        }
        return out([errLine(ctx.shell.errors.tmuxUnknownSubcommandTemplate.replace("{cmd}", sub))]);
      }
      return out([errLine(ctx.shell.errors.tmuxUnknownSubcommandTemplate.replace("{cmd}", sub ?? ""))]);
    }

    default:
      if (ctx.viewNames.includes(cmd) && args.length === 0) {
        // Bare view-name commands print a hint
        // to attach in HOST mode — a bare name never attaches on its own,
        // only `open <view>`/`edith` do (those are the site's own
        // "return commands", per the user's own return_path design).
        if (ctx.mode === "host") return out([errLine(ctx.shell.host.notAttachedMessage)]);
        return { state: base, effect: { kind: "launch", program: cmd } };
      }
      return out([errLine(ctx.shell.errors.commandNotFoundTemplate.replace("{cmd}", cmd))]);
  }

  /** Shared tail of HOST mode's `open <view>`/`edith` — both always target
   * the well-known DEFAULT session by name (never "whichever is most
   * recent"). If that session doesn't exist at
   * all (destroyed via a kill-cascade and never recreated), reports it the
   * same way a missing `-t` target does; otherwise emits the attach-view
   * effect, letting the window-existence check ride along for the
   * (impure) caller to act on (if the window was killed, attach + message
   * per its own judgment). */
  function attachViewOutcome(state: ShellState, runCtx: RunContext, view: string): RunOutcome {
    const found = runCtx.sessions.find((s) => s.name === runCtx.defaultSessionName);
    if (!found) {
      return {
        state: {
          ...state,
          lines: [...state.lines, errLine(runCtx.shell.tmux.cantFindSessionTemplate.replace("{name}", runCtx.defaultSessionName))],
        },
        effect: { kind: "none" },
      };
    }
    return { state, effect: { kind: "attach-view", sessionId: found.id, view, windowExists: found.windowIds.includes(view) } };
  }
}
