// Unit tests for the pure parser/completion logic behind the site-wide
// floating Cmdline — src/lib/cmdline.ts. No
// DOM, no Svelte state: parse, prefix-filter, alias resolution, Tab
// completion, the lifted ex-command machine, and the tmux
// command-prompt grammar, each exercised directly against fixture command
// lists (not the real cmdline.yaml, so this suite can't drift silently if
// the yaml's wording changes — only its SHAPE matters here).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completeInput,
  cycleComplete,
  filterSuggestions,
  mergeCommandLists,
  parseExCommand,
  parseInput,
  parseTmuxCommand,
  resolveCommand,
  type CommandDef,
} from "../../src/lib/cmdline.ts";

const commands: CommandDef[] = [
  { name: "dashboard", aliases: ["home"], description: "jump to the dashboard", action: "view:home" },
  { name: "builds", description: "jump to Builds", action: "view:builds" },
  { name: "grep", description: "open grep", action: "grep", takesArgs: true },
  { name: "reboot", description: "replay boot", action: "reboot" },
  { name: "resume", aliases: ["cv"], description: "download resume", action: "resume" },
  { name: "q", description: "kill the current window", action: "kill-window" },
];

// ---------------------------------------------------------------------
// parseInput
// ---------------------------------------------------------------------

test("parseInput splits a bare command with no args", () => {
  assert.deepEqual(parseInput("dashboard"), { name: "dashboard", args: "" });
});

test("parseInput splits a command with a single-word argument", () => {
  assert.deepEqual(parseInput("grep astro"), { name: "grep", args: "astro" });
});

test("parseInput preserves internal spaces in the argument", () => {
  assert.deepEqual(parseInput("rename-window my window"), { name: "rename-window", args: "my window" });
});

test("parseInput trims surrounding whitespace and a leading colon", () => {
  assert.deepEqual(parseInput("  :q  "), { name: "q", args: "" });
  assert.deepEqual(parseInput(":grep  astro.config  "), { name: "grep", args: "astro.config" });
});

test("parseInput on empty input returns an empty name and no args", () => {
  assert.deepEqual(parseInput(""), { name: "", args: "" });
  assert.deepEqual(parseInput("   "), { name: "", args: "" });
});

// ---------------------------------------------------------------------
// resolveCommand (aliases)
// ---------------------------------------------------------------------

test("resolveCommand matches by exact name, case-insensitively", () => {
  assert.equal(resolveCommand(commands, "builds")?.name, "builds");
  assert.equal(resolveCommand(commands, "BUILDS")?.name, "builds");
});

test("resolveCommand matches by alias", () => {
  assert.equal(resolveCommand(commands, "home")?.name, "dashboard");
  assert.equal(resolveCommand(commands, "cv")?.name, "resume");
});

test("resolveCommand returns undefined for an unknown name and for an empty string", () => {
  assert.equal(resolveCommand(commands, "bogus"), undefined);
  assert.equal(resolveCommand(commands, ""), undefined);
});

// ---------------------------------------------------------------------
// filterSuggestions (prefix filtering)
// ---------------------------------------------------------------------

test("filterSuggestions with an empty prefix returns every command unfiltered", () => {
  assert.equal(filterSuggestions(commands, "").length, commands.length);
});

test("filterSuggestions matches a name prefix, case-insensitively", () => {
  const hits = filterSuggestions(commands, "BU");
  assert.deepEqual(hits.map((c) => c.name), ["builds"]);
});

test("filterSuggestions matches an alias prefix too", () => {
  const hits = filterSuggestions(commands, "cv");
  assert.deepEqual(hits.map((c) => c.name), ["resume"]);
});

test("filterSuggestions returns nothing for a prefix no command or alias starts with", () => {
  assert.equal(filterSuggestions(commands, "zzz").length, 0);
});

// ---------------------------------------------------------------------
// completeInput (Tab completion)
// ---------------------------------------------------------------------

test("completeInput completes a unique prefix to the full name", () => {
  assert.equal(completeInput(commands, "bui"), "builds");
});

test("completeInput completes to the first match when several share a prefix", () => {
  const ambiguous: CommandDef[] = [
    { name: "personnel", description: "" },
    { name: "profile", description: "" },
  ];
  assert.equal(completeInput(ambiguous, "p"), "personnel");
});

test("completeInput preserves an already-typed argument", () => {
  assert.equal(completeInput(commands, "gr astro.config"), "grep astro.config");
});

test("completeInput is a no-op on an already-exact name (doesn't jump to an earlier match)", () => {
  assert.equal(completeInput(commands, "q"), "q");
});

test("completeInput returns null for empty input or no match", () => {
  assert.equal(completeInput(commands, ""), null);
  assert.equal(completeInput(commands, "zzz"), null);
});

// ---------------------------------------------------------------------
// cycleComplete (zsh-style repeated-Tab cycling: the only way multiple Tab
// matches are still reachable now that Cmdline.svelte no longer renders a
// suggestions list)
// ---------------------------------------------------------------------

const ambiguousKill: CommandDef[] = [
  { name: "kill-window", description: "" },
  { name: "kill-pane", description: "" },
];

test("cycleComplete: first press (prev=null) completes to the first match", () => {
  const result = cycleComplete(ambiguousKill, "kill", null);
  assert.equal(result?.text, "kill-window");
  assert.equal(result?.state.index, 0);
});

test("cycleComplete: a second press (prev supplied) advances to the next match", () => {
  const first = cycleComplete(ambiguousKill, "kill", null);
  const second = cycleComplete(ambiguousKill, first?.text ?? "", first?.state ?? null);
  assert.equal(second?.text, "kill-pane");
  assert.equal(second?.state.index, 1);
});

test("cycleComplete: cycling wraps back around to the first match", () => {
  const first = cycleComplete(ambiguousKill, "kill", null);
  const second = cycleComplete(ambiguousKill, first?.text ?? "", first?.state ?? null);
  const third = cycleComplete(ambiguousKill, second?.text ?? "", second?.state ?? null);
  assert.equal(third?.text, "kill-window");
  assert.equal(third?.state.index, 0);
});

test("cycleComplete: a single match is idempotent across repeated presses", () => {
  const first = cycleComplete(commands, "reb", null);
  assert.equal(first?.text, "reboot");
  const second = cycleComplete(commands, first?.text ?? "", first?.state ?? null);
  assert.equal(second?.text, "reboot");
});

test("cycleComplete: preserves an already-typed argument across cycles", () => {
  const first = cycleComplete(ambiguousKill, "kill astro", null);
  assert.equal(first?.text, "kill-window astro");
  const second = cycleComplete(ambiguousKill, first?.text ?? "", first?.state ?? null);
  assert.equal(second?.text, "kill-pane astro");
});

test("cycleComplete: empty input (prev=null) is a no-op, same as completeInput", () => {
  assert.equal(cycleComplete(commands, "", null), null);
});

test("cycleComplete: no matches (prev=null) is a no-op", () => {
  assert.equal(cycleComplete(commands, "zzz", null), null);
});

// ---------------------------------------------------------------------
// mergeCommandLists (editor ex-mode suggestion merge — "editor context
// wins" on a name collision)
// ---------------------------------------------------------------------

test("mergeCommandLists keeps the primary list's entry on a name collision", () => {
  const exCommands: CommandDef[] = [{ name: "q", description: "close the file editor" }];
  const merged = mergeCommandLists(exCommands, commands);
  const q = merged.filter((c) => c.name === "q");
  assert.equal(q.length, 1, "q must appear exactly once, not twice");
  assert.equal(q[0].description, "close the file editor");
});

test("mergeCommandLists still includes every non-colliding secondary entry", () => {
  const exCommands: CommandDef[] = [{ name: "q", description: "close the file editor" }];
  const merged = mergeCommandLists(exCommands, commands);
  assert.ok(merged.some((c) => c.name === "grep"));
  assert.ok(merged.some((c) => c.name === "reboot"));
  assert.equal(merged.length, commands.length); // "q" collided, everything else survived
});

// ---------------------------------------------------------------------
// parseExCommand (the ex-command machine)
// ---------------------------------------------------------------------

test("parseExCommand recognizes q and q! as close", () => {
  assert.deepEqual(parseExCommand("q"), { kind: "close" });
  assert.deepEqual(parseExCommand("q!"), { kind: "close" });
});

test("parseExCommand recognizes w and wq as writeError", () => {
  assert.deepEqual(parseExCommand("w"), { kind: "writeError" });
  assert.deepEqual(parseExCommand("wq"), { kind: "writeError" });
});

test("parseExCommand recognizes w! and wq! as writeError too (no distinct force behavior)", () => {
  assert.deepEqual(parseExCommand("w!"), { kind: "writeError" });
  assert.deepEqual(parseExCommand("wq!"), { kind: "writeError" });
});

test("parseExCommand recognizes a bare number as a jump", () => {
  assert.deepEqual(parseExCommand("42"), { kind: "jump", line: 42 });
  assert.deepEqual(parseExCommand("0"), { kind: "jump", line: 0 });
});

test("parseExCommand reports unknown for anything else (site-wide commands included)", () => {
  assert.deepEqual(parseExCommand("dashboard"), { kind: "unknown" });
  assert.deepEqual(parseExCommand("bogus"), { kind: "unknown" });
  assert.deepEqual(parseExCommand(""), { kind: "unknown" });
});

// ---------------------------------------------------------------------
// parseTmuxCommand (Ctrl-b : command-prompt grammar)
// ---------------------------------------------------------------------

test("parseTmuxCommand parses rename-window with its argument", () => {
  assert.deepEqual(parseTmuxCommand("rename-window scratch"), { kind: "rename-window", name: "scratch" });
});

test("parseTmuxCommand reports usage when rename-window has no argument", () => {
  assert.deepEqual(parseTmuxCommand("rename-window"), { kind: "usage", command: "rename-window" });
  assert.deepEqual(parseTmuxCommand("rename-window   "), { kind: "usage", command: "rename-window" });
});

test("parseTmuxCommand parses kill-window and kill-pane with no arguments", () => {
  assert.deepEqual(parseTmuxCommand("kill-window"), { kind: "kill-window" });
  assert.deepEqual(parseTmuxCommand("kill-pane"), { kind: "kill-pane" });
});

test("parseTmuxCommand parses select-window with a numeric index", () => {
  assert.deepEqual(parseTmuxCommand("select-window 3"), { kind: "select-window", index: 3 });
  assert.deepEqual(parseTmuxCommand("select-window 0"), { kind: "select-window", index: 0 });
});

test("parseTmuxCommand reports usage when select-window's argument isn't numeric", () => {
  assert.deepEqual(parseTmuxCommand("select-window"), { kind: "usage", command: "select-window" });
  assert.deepEqual(parseTmuxCommand("select-window abc"), { kind: "usage", command: "select-window" });
});

test("parseTmuxCommand reports unknown for anything else", () => {
  assert.deepEqual(parseTmuxCommand("dashboard"), { kind: "unknown" });
  assert.deepEqual(parseTmuxCommand("q"), { kind: "unknown" });
});

test("parseTmuxCommand is case-insensitive on the command name but not the rename argument", () => {
  assert.deepEqual(parseTmuxCommand("Kill-Window"), { kind: "kill-window" });
  assert.deepEqual(parseTmuxCommand("Rename-Window MyWindow"), { kind: "rename-window", name: "MyWindow" });
});
