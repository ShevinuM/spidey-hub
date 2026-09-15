// Exercises src/common/lib/cmdline.ts against fixture command lists, not the real cmdline.yaml, so only the data's shape matters here, not its wording.
import { expect, test } from "vitest";
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
} from "../../lib/cmdline";

const commands: CommandDef[] = [
  {
    name: "dashboard",
    aliases: ["home"],
    description: "jump to the dashboard",
    action: "view:home",
  },
  { name: "repositories", description: "jump to Repositories", action: "view:repositories" },
  { name: "grep", description: "open grep", action: "grep", takesArgs: true },
  { name: "reboot", description: "replay boot", action: "reboot" },
  { name: "resume", aliases: ["cv"], description: "download resume", action: "resume" },
  { name: "q", description: "kill the current window", action: "kill-window" },
];

// ---------------------------------------------------------------------
// parseInput
// ---------------------------------------------------------------------

test("parseInput splits a bare command with no args", () => {
  expect(parseInput("dashboard")).toEqual({ name: "dashboard", args: "" });
});

test("parseInput splits a command with a single-word argument", () => {
  expect(parseInput("grep astro")).toEqual({ name: "grep", args: "astro" });
});

test("parseInput preserves internal spaces in the argument", () => {
  expect(parseInput("rename-window my window")).toEqual({
    name: "rename-window",
    args: "my window",
  });
});

test("parseInput trims surrounding whitespace and a leading colon", () => {
  expect(parseInput("  :q  ")).toEqual({ name: "q", args: "" });
  expect(parseInput(":grep  astro.config  ")).toEqual({ name: "grep", args: "astro.config" });
});

test("parseInput on empty input returns an empty name and no args", () => {
  expect(parseInput("")).toEqual({ name: "", args: "" });
  expect(parseInput("   ")).toEqual({ name: "", args: "" });
});

// ---------------------------------------------------------------------
// resolveCommand (aliases)
// ---------------------------------------------------------------------

test("resolveCommand matches by exact name, case-insensitively", () => {
  expect(resolveCommand(commands, "repositories")?.name).toBe("repositories");
  expect(resolveCommand(commands, "REPOSITORIES")?.name).toBe("repositories");
});

test("resolveCommand matches by alias", () => {
  expect(resolveCommand(commands, "home")?.name).toBe("dashboard");
  expect(resolveCommand(commands, "cv")?.name).toBe("resume");
});

test("resolveCommand returns undefined for an unknown name and for an empty string", () => {
  expect(resolveCommand(commands, "bogus")).toBe(undefined);
  expect(resolveCommand(commands, "")).toBe(undefined);
});

// ---------------------------------------------------------------------
// filterSuggestions (prefix filtering)
// ---------------------------------------------------------------------

test("filterSuggestions with an empty prefix returns every command unfiltered", () => {
  expect(filterSuggestions(commands, "").length).toBe(commands.length);
});

test("filterSuggestions matches a name prefix, case-insensitively", () => {
  const hits = filterSuggestions(commands, "REP");
  expect(hits.map((c) => c.name)).toEqual(["repositories"]);
});

test("filterSuggestions matches an alias prefix too", () => {
  const hits = filterSuggestions(commands, "cv");
  expect(hits.map((c) => c.name)).toEqual(["resume"]);
});

test("filterSuggestions returns nothing for a prefix no command or alias starts with", () => {
  expect(filterSuggestions(commands, "zzz").length).toBe(0);
});

// ---------------------------------------------------------------------
// completeInput (Tab completion)
// ---------------------------------------------------------------------

test("completeInput completes a unique prefix to the full name", () => {
  expect(completeInput(commands, "rep")).toBe("repositories");
});

test("completeInput completes to the first match when several share a prefix", () => {
  const ambiguous: CommandDef[] = [
    { name: "personnel", description: "" },
    { name: "profile", description: "" },
  ];
  expect(completeInput(ambiguous, "p")).toBe("personnel");
});

test("completeInput preserves an already-typed argument", () => {
  expect(completeInput(commands, "gr astro.config")).toBe("grep astro.config");
});

test("completeInput is a no-op on an already-exact name (doesn't jump to an earlier match)", () => {
  expect(completeInput(commands, "q")).toBe("q");
});

test("completeInput returns null for empty input or no match", () => {
  expect(completeInput(commands, "")).toBe(null);
  expect(completeInput(commands, "zzz")).toBe(null);
});

// ---------------------------------------------------------------------
// cycleComplete (zsh-style repeated-Tab cycling: Cmdline.svelte renders no suggestions list, so this is the only way to reach multiple Tab matches)
// ---------------------------------------------------------------------

const ambiguousKill: CommandDef[] = [
  { name: "kill-window", description: "" },
  { name: "kill-pane", description: "" },
];

test("cycleComplete: first press (prev=null) completes to the first match", () => {
  const result = cycleComplete(ambiguousKill, "kill", null);
  expect(result?.text).toBe("kill-window");
  expect(result?.state.index).toBe(0);
});

test("cycleComplete: a second press (prev supplied) advances to the next match", () => {
  const first = cycleComplete(ambiguousKill, "kill", null);
  const second = cycleComplete(ambiguousKill, first?.text ?? "", first?.state ?? null);
  expect(second?.text).toBe("kill-pane");
  expect(second?.state.index).toBe(1);
});

test("cycleComplete: cycling wraps back around to the first match", () => {
  const first = cycleComplete(ambiguousKill, "kill", null);
  const second = cycleComplete(ambiguousKill, first?.text ?? "", first?.state ?? null);
  const third = cycleComplete(ambiguousKill, second?.text ?? "", second?.state ?? null);
  expect(third?.text).toBe("kill-window");
  expect(third?.state.index).toBe(0);
});

test("cycleComplete: a single match is idempotent across repeated presses", () => {
  const first = cycleComplete(commands, "reb", null);
  expect(first?.text).toBe("reboot");
  const second = cycleComplete(commands, first?.text ?? "", first?.state ?? null);
  expect(second?.text).toBe("reboot");
});

test("cycleComplete: preserves an already-typed argument across cycles", () => {
  const first = cycleComplete(ambiguousKill, "kill astro", null);
  expect(first?.text).toBe("kill-window astro");
  const second = cycleComplete(ambiguousKill, first?.text ?? "", first?.state ?? null);
  expect(second?.text).toBe("kill-pane astro");
});

test("cycleComplete: empty input (prev=null) is a no-op, same as completeInput", () => {
  expect(cycleComplete(commands, "", null)).toBe(null);
});

test("cycleComplete: no matches (prev=null) is a no-op", () => {
  expect(cycleComplete(commands, "zzz", null)).toBe(null);
});

// ---------------------------------------------------------------------
// mergeCommandLists (editor ex-mode suggestion merge — "editor context
// wins" on a name collision)
// ---------------------------------------------------------------------

test("mergeCommandLists keeps the primary list's entry on a name collision", () => {
  const exCommands: CommandDef[] = [{ name: "q", description: "close the file editor" }];
  const merged = mergeCommandLists(exCommands, commands);
  const q = merged.filter((c) => c.name === "q");
  expect(q.length, "q must appear exactly once, not twice").toBe(1);
  expect(q[0].description).toBe("close the file editor");
});

test("mergeCommandLists still includes every non-colliding secondary entry", () => {
  const exCommands: CommandDef[] = [{ name: "q", description: "close the file editor" }];
  const merged = mergeCommandLists(exCommands, commands);
  expect(merged.some((c) => c.name === "grep")).toBeTruthy();
  expect(merged.some((c) => c.name === "reboot")).toBeTruthy();
  expect(merged.length).toBe(commands.length); // "q" collided, everything else survived
});

// ---------------------------------------------------------------------
// parseExCommand (the ex-command machine)
// ---------------------------------------------------------------------

test("parseExCommand recognizes q and q! as close", () => {
  expect(parseExCommand("q")).toEqual({ kind: "close" });
  expect(parseExCommand("q!")).toEqual({ kind: "close" });
});

test("parseExCommand recognizes w and wq as writeError", () => {
  expect(parseExCommand("w")).toEqual({ kind: "writeError" });
  expect(parseExCommand("wq")).toEqual({ kind: "writeError" });
});

test("parseExCommand recognizes w! and wq! as writeError too (no distinct force behavior)", () => {
  expect(parseExCommand("w!")).toEqual({ kind: "writeError" });
  expect(parseExCommand("wq!")).toEqual({ kind: "writeError" });
});

test("parseExCommand recognizes a bare number as a jump", () => {
  expect(parseExCommand("42")).toEqual({ kind: "jump", line: 42 });
  expect(parseExCommand("0")).toEqual({ kind: "jump", line: 0 });
});

test("parseExCommand reports unknown for anything else (site-wide commands included)", () => {
  expect(parseExCommand("dashboard")).toEqual({ kind: "unknown" });
  expect(parseExCommand("bogus")).toEqual({ kind: "unknown" });
  expect(parseExCommand("")).toEqual({ kind: "unknown" });
});

// ---------------------------------------------------------------------
// parseTmuxCommand (Ctrl-b : command-prompt grammar)
// ---------------------------------------------------------------------

test("parseTmuxCommand parses rename-window with its argument", () => {
  expect(parseTmuxCommand("rename-window scratch")).toEqual({
    kind: "rename-window",
    name: "scratch",
  });
});

test("parseTmuxCommand reports usage when rename-window has no argument", () => {
  expect(parseTmuxCommand("rename-window")).toEqual({ kind: "usage", command: "rename-window" });
  expect(parseTmuxCommand("rename-window   ")).toEqual({ kind: "usage", command: "rename-window" });
});

test("parseTmuxCommand parses kill-window and kill-pane with no arguments", () => {
  expect(parseTmuxCommand("kill-window")).toEqual({ kind: "kill-window" });
  expect(parseTmuxCommand("kill-pane")).toEqual({ kind: "kill-pane" });
});

test("parseTmuxCommand parses select-window with a numeric index", () => {
  expect(parseTmuxCommand("select-window 3")).toEqual({ kind: "select-window", index: 3 });
  expect(parseTmuxCommand("select-window 0")).toEqual({ kind: "select-window", index: 0 });
});

test("parseTmuxCommand reports usage when select-window's argument isn't numeric", () => {
  expect(parseTmuxCommand("select-window")).toEqual({ kind: "usage", command: "select-window" });
  expect(parseTmuxCommand("select-window abc")).toEqual({
    kind: "usage",
    command: "select-window",
  });
});

test("parseTmuxCommand reports unknown for anything else", () => {
  expect(parseTmuxCommand("dashboard")).toEqual({ kind: "unknown" });
  expect(parseTmuxCommand("q")).toEqual({ kind: "unknown" });
});

test("parseTmuxCommand is case-insensitive on the command name but not the rename argument", () => {
  expect(parseTmuxCommand("Kill-Window")).toEqual({ kind: "kill-window" });
  expect(parseTmuxCommand("Rename-Window MyWindow")).toEqual({
    kind: "rename-window",
    name: "MyWindow",
  });
});
