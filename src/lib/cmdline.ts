// Pure parser/completion logic for the site-wide floating Cmdline
// (unit-testable: parse, match/filter, complete). No DOM, no
// Svelte state, no side effects — src/components/Cmdline.svelte and
// Terminal.svelte own the stateful/effectful parts (open/close, text state,
// dispatching a resolved command to a view switch / grep open / window
// mutation / etc.), exactly the same split Editor.svelte already uses for
// src/lib/vim.ts.

/** One entry in src/data/cmdline.yaml's `commands`/`exCommands`/
 * `tmuxCommands` arrays. `action` is an internal identifier the caller
 * switches on (never rendered) for the site-wide list; ex/tmux commands are
 * matched by `name` itself (parseExCommand/parseTmuxCommand below) rather
 * than an `action` id, so it's optional here. */
export interface CommandDef {
  name: string;
  aliases?: string[];
  description: string;
  action?: string;
  takesArgs?: boolean;
}

export interface ParsedInput {
  /** The first whitespace-delimited token, lowercased-comparison-ready but
   * NOT itself lowercased (callers that need case-insensitive matching do
   * that themselves, e.g. resolveCommand below) — kept verbatim so a
   * command that legitimately cares about case in its own name (none do
   * today) isn't silently mangled. */
  name: string;
  /** Everything after the first run of whitespace, trimmed. Empty string
   * when there's no argument. */
  args: string;
}

/** Splits raw cmdline text into a command name + its argument string. A
 * leading ":" is tolerated and stripped (callers may pass either the raw
 * text after the box's own prompt glyph, which never includes it, or a
 * full ex-command-style string that does) so this is safe to reuse from
 * either direction. */
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

/** Prefix-filters `commands` against `prefix` (matched against the name OR
 * any alias, case-insensitively) — the live suggestion list under the
 * input. An empty prefix returns every command, unfiltered
 * (the box's own resting state: nothing typed yet). */
export function filterSuggestions(commands: CommandDef[], prefix: string): CommandDef[] {
  const p = prefix.toLowerCase();
  if (!p) return commands;
  return commands.filter(
    (c) => c.name.toLowerCase().startsWith(p) || (c.aliases ?? []).some((a) => a.toLowerCase().startsWith(p)),
  );
}

/** Tab completion: completes the unique/first match.
 * Completes only the COMMAND NAME token, leaving any already-typed
 * argument text untouched; returns `null` when there's nothing to complete
 * (empty input, or no command matches the typed prefix). An exact
 * case-insensitive match short-circuits to itself (so completing an
 * already-complete name is a no-op rather than jumping to some other
 * matching entry earlier in the list). */
export function completeInput(commands: CommandDef[], input: string): string | null {
  const { name, args } = parseInput(input);
  if (!name) return null;
  const matches = filterSuggestions(commands, name);
  if (matches.length === 0) return null;
  const exact = matches.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const target = exact ?? matches[0];
  return args ? `${target.name} ${args}` : target.name;
}

/** zsh-style repeated-Tab cycling: the suggestions list UI is gone from
 * Cmdline.svelte, so this is now the
 * only way multiple Tab-matches are still reachable from the keyboard.
 * `prev` is the state this same function returned on the IMMEDIATELY
 * preceding Tab press, or `null` on the first Tab press for a given typed
 * prefix (the caller — Cmdline.svelte — resets to `null` on every non-Tab
 * keydown, so `prev` being non-null is exactly "the last thing that
 * happened was also a Tab").
 *
 * First press (`prev === null`): completes to the first match for the
 * current text's command-name token (same "nothing to complete" cases as
 * completeInput — empty name, or no matches — return `null`). Each
 * following press with `prev` supplied advances to the NEXT match in that
 * same fixed match list, wrapping around — it does NOT re-derive matches
 * from whatever `input` currently is, since by construction `input` is
 * always exactly what the previous press already wrote there. */
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

/** Merges two command lists for DISPLAY (suggestions), preferring `primary`
 * on a name collision — used to build the editor ex-mode suggestion list,
 * where editor context wins: `exCommands`' own `q`/`w`
 * entries shadow `commands`' site-wide `q` (kill-window) so the box shows
 * the EDITOR meaning while one is open. Execution order is independent of
 * this — parseExCommand always gets first refusal regardless of what the
 * suggestion list displays — this only prevents the same name from
 * appearing twice with two different descriptions. */
export function mergeCommandLists(primary: CommandDef[], secondary: CommandDef[]): CommandDef[] {
  const primaryNames = new Set(primary.map((c) => c.name.toLowerCase()));
  return [...primary, ...secondary.filter((c) => !primaryNames.has(c.name.toLowerCase()))];
}

// ---------------------------------------------------------------------
// Ex-command parsing — a pure function shared between Editor.svelte's
// execution and this file's own unit tests.
// ---------------------------------------------------------------------

export type ExCommand =
  | { kind: "close" }
  | { kind: "writeError" }
  | { kind: "jump"; line: number }
  | { kind: "unknown" };

export function parseExCommand(cmd: string): ExCommand {
  if (cmd === "q" || cmd === "q!") return { kind: "close" };
  // "w!"/"wq!" are treated exactly like "w"/"wq" — this viewer never writes
  // regardless of the bang, so there is no distinct "force" behavior to
  // implement; the bang variants exist in real vim only to override the
  // readonly refusal `writeError` already reports.
  if (cmd === "w" || cmd === "wq" || cmd === "w!" || cmd === "wq!") return { kind: "writeError" };
  if (/^\d+$/.test(cmd)) return { kind: "jump", line: Number.parseInt(cmd, 10) };
  return { kind: "unknown" };
}

// ---------------------------------------------------------------------
// tmux command-prompt parsing (`Ctrl-b :`).
// ---------------------------------------------------------------------

/** The 7 preset names `select-layout` accepts. Deliberately its OWN small
 * literal list, not an import of
 * src/lib/tmux.ts's `LAYOUT_NAMES` — mirrors src/lib/shell.ts's documented
 * decoupling convention (that file's own `pickMostRecentUnattached` comment:
 * these small pure modules stay independent of tmux.ts's shape, duplicating
 * a short constant rather than adding a cross-module dependency). */
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
