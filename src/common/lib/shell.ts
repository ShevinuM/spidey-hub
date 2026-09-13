// Pure line-parser/builtins/fs-navigation logic for the in-window shell; Shell.svelte owns the stateful/effectful parts, the same split cmdline.ts uses for Cmdline.svelte.
//
// Deliberately serves both the per-pane shell (`mode: "pane"`) and the detached host shell (`mode: "host"`) without rework.
import type { ShellData } from "./data";
import { formatCtime } from "./clock";

// State

export type ShellLineKind = "input" | "output" | "error";

export interface ShellLine {
  text: string;
  kind: ShellLineKind;
}

/**
 * Lives inside a tmux.ts `Pane`: only `reboot()` or a page reload resets these buffers, exactly like a real tmux pane's scrollback.
 *
 * `cwd` is a segment array, never a raw string, so `..`/`.` normalization has one home (`resolveCd` below).
 */
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

// Line parsing — no pipes/redirection/globbing: a plain whitespace split is the whole grammar.

export interface ParsedLine {
  cmd: string;
  args: string[];
}

export function parseLine(line: string): ParsedLine {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  return { cmd: parts[0] ?? "", args: parts.slice(1) };
}

// fs-index navigation over a flat {path, size?}[] list, declared as its own structurally-equivalent type rather than importing repo-tree.ts's/grep.ts's, so this stays a zero-Svelte-dependency pure module.
// `size` is absent for `repos/*` entries, which are paths only, taken from the per-repo index JSONs without an extra byte-size pass.

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
 * case-insensitive name — same convention as src/common/lib/repo-tree.ts's
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

/**
 * `tree`(1)-style ASCII rendering of `segments` and its descendants, capped at `maxDepth` levels beyond `segments` itself.
 *
 * A directory at the cap is listed but its children are replaced by a single `…` marker; the root label is `.` at the fs root, else the cwd's last segment.
 */
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

/**
 * Where `cat <argPath>` should pull content from, decided before fetching so the caller knows whether to warm the grep index or a specific repo index.
 *
 * Pure — depends only on the fs-index structure, never on whether content has actually been fetched.
 */
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

// History / input editing — driven by keydowns directly, not by `runCommand` (which only runs on Enter).

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

// Prompt

export type ShellMode = "pane" | "host";

/** `{path}` is "" at the fs root, else "/" + the cwd's segments joined —
 * host mode ignores `cwd` entirely (real tmux's own detached host shell has
 * no notion of "the site's fs", only the mock's own fixed prompt). */
export function formatPrompt(mode: ShellMode, shell: ShellData, cwd: string[]): string {
  if (mode === "host") return shell.prompt.hostTemplate;
  const path = cwd.length === 0 ? "" : `/${joinPath(cwd)}`;
  return shell.prompt.paneTemplate.replace("{path}", path);
}

// runCommand — the Enter-key dispatcher

export interface SessionSummary {
  name: string;
  windowCount: number;
  createdAt: number;
  attached: boolean;
}

/**
 * One roster row for `tmux ls`, the new/attach duplicate and missing-session checks, and `open <view>`'s window-existence check.
 *
 * Deliberately its own type, not a re-export of tmux.ts's `Session`, so shell.ts stays a zero-Svelte/zero-tmux.ts-dependency pure module.
 */
export interface SessionRosterEntry {
  id: string;
  name: string;
  windowCount: number;
  createdAt: number;
  attached: boolean;
  /** Mirrors tmux.ts's `Session.lastAttachedSeq`; see that field's comment for why it's a logical counter, not a clock read. */
  lastAttachedSeq: number;
  /** Every window id currently present in this session, used by `open <view>`'s window-existence check. */
  windowIds: string[];
}

export interface RunContext {
  fsEntries: FsEntry[];
  /** Already-warmed content lookup for `cat`; the caller resolves `resolveCatTarget` and fetches first, and `undefined` means a structurally real file with no captured content (binary, over the size cap, or unindexed). */
  resolveContent: (target: CatTarget) => string | undefined;
  mode: ShellMode;
  /** Real "now", supplied by the caller so this module never calls `Date.now()` itself. */
  nowMs: number;
  /** Used only for neofetch's uptime anchor; `tmux ls` reads the full `sessions` roster instead. */
  session: SessionSummary;
  /** Every session the client currently knows about, attached or not — the validation source for `tmux ls`/`new`/`a`/`attach`; always populated in both pane and host mode. */
  sessions: SessionRosterEntry[];
  /** The well-known default session's bare name; HOST mode's `open <view>`/`edith` always targets this specific session, never "whichever is most recent". */
  defaultSessionName: string;
  shell: ShellData;
  /** The six canonical program names, for bare-command validation on `open`/relaunch-by-name. */
  viewNames: readonly string[];
}

export type ShellEffect =
  | { kind: "none" }
  | { kind: "launch"; program: string }
  | { kind: "exit-pane" }
  | { kind: "reboot" }
  /** `tmux a [-t name]` resolved to an existing session id; the caller performs the actual `attachSession()` mutation. */
  | { kind: "attach"; sessionId: string }
  /** `tmux new [-s name]`; `name` is already fully resolved/validated by the time this effect is returned, and the caller creates and immediately attaches. */
  | { kind: "create-and-attach"; name: string }
  /** HOST mode's `open <view>`/`edith` builtin: attaches the default session and selects `view`'s window if `windowExists`, else the caller shows a fallback message instead of navigating. */
  | { kind: "attach-view"; sessionId: string; view: string; windowExists: boolean }
  /**
   * `vim`/`vi`/`nvim <file>`: `path` is the fully-resolved display path, `content` its already-fetched text, pre-warmed the same way `cat` is.
   *
   * The caller opens a read-only Editor over this pane; `:q` there drops back to this shell without killing the pane.
   */
  | { kind: "open-editor"; path: string; content: string };

export interface RunOutcome {
  state: ShellState;
  effect: ShellEffect;
}

// Sessions

/** Bare `tmux new`'s next numeric name: the first positive integer, as a string, not already in use by any existing session. */
export function nextNumericSessionName(existingNames: string[]): string {
  let n = 1;
  while (existingNames.includes(String(n))) n += 1;
  return String(n);
}

/** Bare `tmux a`/`attach`'s "most recently used unattached session": the highest `lastAttachedSeq`, or `undefined` for an empty roster. */
function pickMostRecentUnattached(sessions: SessionRosterEntry[]): SessionRosterEntry | undefined {
  return [...sessions].sort((a, b) => b.lastAttachedSeq - a.lastAttachedSeq)[0];
}

/** Builds the detached HOST shell's pre-seeded scrollback from shell.yaml's `host.narrative` rows, substituting each row's `{session}` placeholder. */
export function seedHostNarrative(shell: ShellData, sessionName: string): ShellLine[] {
  return shell.host.narrative.map((row) => ({ text: row.text.replace("{session}", sessionName), kind: row.kind }));
}

function formatUptime(shell: ShellData, fromMs: number, toMs: number): string {
  const mins = Math.max(0, Math.floor((toMs - fromMs) / 60000));
  return shell.neofetch.uptimeTemplate.replace("{mins}", String(mins));
}

/**
 * Runs one submitted (Enter-pressed) line, always echoing the prompt+typed text as the first appended line — even a bare Enter, which otherwise does nothing visible.
 *
 * History only grows for a non-blank line.
 */
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

    // `vim`/`vi`/`nvim <file>` reuse `cat`'s path-resolution and content-fetch machinery; this viewer never writes.
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

    // HOST mode only; a pane shell has nothing to attach (it's already attached), so this falls through to command-not-found.
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

      // Inside a pane shell, new/attach always refuse (real tmux nesting protection); `ls` above works everywhere.
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
        // Bare view-name commands print a hint to attach in HOST mode; only `open <view>`/`edith` actually attach.
        if (ctx.mode === "host") return out([errLine(ctx.shell.host.notAttachedMessage)]);
        return { state: base, effect: { kind: "launch", program: cmd } };
      }
      return out([errLine(ctx.shell.errors.commandNotFoundTemplate.replace("{cmd}", cmd))]);
  }

  /**
   * Shared tail of HOST mode's `open <view>`/`edith`, both of which always target the well-known default session by name.
   *
   * Reports a missing default session the same way a missing `-t` target does; otherwise emits the attach-view effect with the window-existence check for the caller to act on.
   */
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
