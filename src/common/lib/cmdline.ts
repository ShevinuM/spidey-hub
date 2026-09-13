// Pure parser/completion logic for the cmdline; Cmdline.svelte and Terminal.svelte own the stateful/effectful parts, the same split Editor.svelte uses for vim.ts.

/** One entry in cmdline.yaml's `commands`/`exCommands`/`tmuxCommands` arrays; `action` is only used by the site-wide list, since ex/tmux commands match by `name` instead. */
export interface CommandDef {
  name: string;
  aliases?: string[];
  description: string;
  action?: string;
  takesArgs?: boolean;
}

export interface ParsedInput {
  /** The first whitespace-delimited token, kept verbatim (not lowercased) so callers needing case-insensitive matching do that themselves. */
  name: string;
  /** Everything after the first run of whitespace, trimmed. Empty string
   * when there's no argument. */
  args: string;
}

/** Splits raw cmdline text into a command name + argument string; a leading ":" is tolerated and stripped so this is safe to reuse from either the box's text or a full ex-command string. */
export function parseInput(input: string): ParsedInput {
  const trimmed = input.trim().replace(/^:+/, "").trim();
  const spaceIdx = trimmed.search(/\s/);
  if (spaceIdx === -1) return { name: trimmed, args: "" };
  return { name: trimmed.slice(0, spaceIdx), args: trimmed.slice(spaceIdx + 1).trim() };
}

/** Case-insensitive name/alias lookup. */
export function resolveCommand(commands: CommandDef[], name: string): CommandDef | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  return commands.find(
    (c) => c.name.toLowerCase() === lower || (c.aliases ?? []).some((a) => a.toLowerCase() === lower),
  );
}

/** Prefix-filters `commands` against `prefix` (name or alias, case-insensitive); an empty prefix returns every command unfiltered. */
export function filterSuggestions(commands: CommandDef[], prefix: string): CommandDef[] {
  const p = prefix.toLowerCase();
  if (!p) return commands;
  return commands.filter(
    (c) => c.name.toLowerCase().startsWith(p) || (c.aliases ?? []).some((a) => a.toLowerCase().startsWith(p)),
  );
}

/**
 * Tab completion: completes only the command-name token, leaving any already-typed argument text untouched.
 *
 * An exact case-insensitive match short-circuits to itself, so completing an already-complete name is a no-op.
 */
export function completeInput(commands: CommandDef[], input: string): string | null {
  const { name, args } = parseInput(input);
  if (!name) return null;
  const matches = filterSuggestions(commands, name);
  if (matches.length === 0) return null;
  const exact = matches.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const target = exact ?? matches[0];
  return args ? `${target.name} ${args}` : target.name;
}

/**
 * zsh-style repeated-Tab cycling, the only way multiple Tab-matches stay reachable from the keyboard; `prev` is the state returned by the immediately preceding Tab press, or `null` on the first press of a new prefix.
 *
 * Each press with `prev` supplied advances to the next match in that same fixed match list, wrapping around, rather than re-deriving matches from the current input.
 */
export interface TabCycleState {
  args: string;
  matches: CommandDef[];
  index: number;
}

export function cycleComplete(
  commands: CommandDef[],
  input: string,
  prev: TabCycleState | null,
): { text: string; state: TabCycleState } | null {
  if (prev) {
    const index = (prev.index + 1) % prev.matches.length;
    const state: TabCycleState = { ...prev, index };
    const target = state.matches[index];
    return { text: state.args ? `${target.name} ${state.args}` : target.name, state };
  }
  const { name, args } = parseInput(input);
  if (!name) return null;
  const matches = filterSuggestions(commands, name);
  if (matches.length === 0) return null;
  const state: TabCycleState = { args, matches, index: 0 };
  const target = matches[0];
  return { text: args ? `${target.name} ${args}` : target.name, state };
}

/**
 * Merges two command lists for display, preferring `primary` on a name collision, so the editor's `exCommands` can shadow a site-wide command sharing a name (e.g. `q`).
 *
 * This only affects what the suggestion list shows; parseExCommand always gets first refusal at execution time.
 */
export function mergeCommandLists(primary: CommandDef[], secondary: CommandDef[]): CommandDef[] {
  const primaryNames = new Set(primary.map((c) => c.name.toLowerCase()));
  return [...primary, ...secondary.filter((c) => !primaryNames.has(c.name.toLowerCase()))];
}

// Ex-command parsing, a pure function shared between Editor.svelte's execution and this file's own unit tests.

export type ExCommand =
  | { kind: "close" }
  | { kind: "writeError" }
  | { kind: "jump"; line: number }
  | { kind: "unknown" };

export function parseExCommand(cmd: string): ExCommand {
  if (cmd === "q" || cmd === "q!") return { kind: "close" };
  // "w!"/"wq!" behave exactly like "w"/"wq", since this viewer never writes regardless of the bang.
  if (cmd === "w" || cmd === "wq" || cmd === "w!" || cmd === "wq!") return { kind: "writeError" };
  if (/^\d+$/.test(cmd)) return { kind: "jump", line: Number.parseInt(cmd, 10) };
  return { kind: "unknown" };
}

// tmux command-prompt parsing (`Ctrl-b :`).

/** The preset names `select-layout` accepts, deliberately its own literal list rather than importing tmux.ts's `LAYOUT_NAMES`, per shell.ts's decoupling convention. */
const LAYOUT_NAMES = [
  "even-horizontal",
  "even-vertical",
  "main-horizontal",
  "main-horizontal-mirrored",
  "main-vertical",
  "main-vertical-mirrored",
  "tiled",
] as const;

export type TmuxCommand =
  | { kind: "rename-window"; name: string }
  | { kind: "kill-window" }
  | { kind: "kill-pane" }
  | { kind: "select-window"; index: number }
  /** `select-layout` with no argument — reapplies whatever was last applied
   * (or no-ops if nothing has been). */
  | { kind: "select-layout"; name: undefined }
  | { kind: "select-layout"; name: (typeof LAYOUT_NAMES)[number] }
  | { kind: "select-layout-unknown"; name: string }
  | { kind: "usage"; command: "rename-window" | "select-window" }
  | { kind: "unknown" };

export function parseTmuxCommand(input: string): TmuxCommand {
  const { name, args } = parseInput(input);
  const lower = name.toLowerCase();
  if (lower === "rename-window") {
    return args ? { kind: "rename-window", name: args } : { kind: "usage", command: "rename-window" };
  }
  if (lower === "kill-window") return { kind: "kill-window" };
  if (lower === "kill-pane") return { kind: "kill-pane" };
  if (lower === "select-window") {
    if (!/^\d+$/.test(args)) return { kind: "usage", command: "select-window" };
    return { kind: "select-window", index: Number.parseInt(args, 10) };
  }
  if (lower === "select-layout") {
    if (!args) return { kind: "select-layout", name: undefined };
    if ((LAYOUT_NAMES as readonly string[]).includes(args)) {
      return { kind: "select-layout", name: args as (typeof LAYOUT_NAMES)[number] };
    }
    return { kind: "select-layout-unknown", name: args };
  }
  return { kind: "unknown" };
}
