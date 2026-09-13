import { expect, test } from "vitest";
import {
  buildEntries,
  commandEntries,
  keymapEntries,
  levenshtein,
  searchHelp,
  shellEntries,
  type CommandSource,
  type HelpSectionSource,
  type ShellHelpRowSource,
} from "../../lib/help-search";

const commands: CommandSource[] = [
  { name: "dashboard", aliases: ["home"], description: "jump to the dashboard", action: "view:home" },
  { name: "repositories", description: "jump to Repositories", action: "view:repositories" },
  { name: "employment", description: "jump to Employment Records", action: "view:employment" },
  { name: "profile", description: "jump to Profile", action: "view:profile" },
  { name: "retina-v", description: "jump to Retina-V", action: "view:retina-v" },
  { name: "help", description: "jump to Help", action: "view:help" },
  { name: "grep", description: "open the grep overlay", action: "grep", takesArgs: true },
  { name: "reboot", description: "replay the E.D.I.T.H boot sequence", action: "reboot" },
  { name: "resume", aliases: ["cv"], description: "download resume.pdf in a new tab", action: "resume" },
  { name: "q", description: "quit the current program to a shell in this window", action: "exit-program" },
];

const sections: HelpSectionSource[] = [
  {
    title: "tmux prefix (Ctrl-b)",
    rows: [
      {
        key: "&",
        description: "kill-window: status bar prompts \"kill-window <name>? (y/n)\"; y removes the window",
      },
      {
        key: "x",
        description: "kill-pane: confirms then removes the focused panel only",
      },
      { key: "d / w / 0", description: "dashboard" },
    ],
  },
  {
    title: "Grep overlay",
    rows: [{ key: "/", description: "open (from anywhere)" }],
  },
];

// A small representative subset of shell.yaml's own `help.rows[]` shape,
// including shell builtins.
const shellRows: ShellHelpRowSource[] = [
  { cmd: "cd <path>", description: "change directory" },
  { cmd: "neofetch", description: "system info card" },
  { cmd: "sudo <...>", description: "try it" },
];

// ---------------------------------------------------------------------
// commandEntries / keymapEntries / buildEntries
// ---------------------------------------------------------------------

test("commandEntries includes q (exitProgram meaning)", () => {
  const entries = commandEntries(commands);
  expect(entries.length).toBe(commands.length);
  expect(entries.some((e) => e.label === "q" && e.action === "exit-program")).toBeTruthy();
});

test("commandEntries preserves cmdline.yaml's own declared order", () => {
  const entries = commandEntries(commands);
  expect(entries.map((e) => e.label)).toEqual(["dashboard", "repositories", "employment", "profile", "retina-v", "help", "grep", "reboot", "resume", "q"]);
});

test("keymapEntries flattens every section's rows in file order", () => {
  const entries = keymapEntries(sections);
  expect(entries.length).toBe(4);
  expect(entries.map((e) => e.label)).toEqual(["&", "x", "d / w / 0", "/"]);
});

test("buildEntries puts commands before keymap rows", () => {
  const entries = buildEntries(commands, sections);
  expect(entries.length).toBe(commandEntries(commands).length + keymapEntries(sections).length);
  expect(entries[0].kind).toBe("command");
  expect(entries[entries.length - 1].kind).toBe("keymap");
});

test("shellEntries maps shell.yaml's help rows to keymap-shaped entries (cmd -> label, description -> description)", () => {
  const entries = shellEntries(shellRows);
  expect(entries.map((e) => ({ kind: e.kind, label: e.label, description: e.description }))).toEqual([
      { kind: "keymap", label: "cd <path>", description: "change directory" },
      { kind: "keymap", label: "neofetch", description: "system info card" },
      { kind: "keymap", label: "sudo <...>", description: "try it" },
    ]);
});

test("buildEntries appends shell builtins LAST — commands, then help scope keymap rows, then shell rows", () => {
  const entries = buildEntries(commands, sections, shellRows);
  expect(entries.length).toBe(commandEntries(commands).length + keymapEntries(sections).length + shellEntries(shellRows).length);
  expect(entries[entries.length - 1].label).toBe("sudo <...>");
});

test("buildEntries defaults shellRows to [] — existing two-argument callers are unaffected", () => {
  const entries = buildEntries(commands, sections);
  expect(entries.length).toBe(commandEntries(commands).length + keymapEntries(sections).length);
});

// ---------------------------------------------------------------------
// searchHelp — scoring cascade canaries
// ---------------------------------------------------------------------

test('searchHelp: "kil" ranks the kill-window and kill-pane keymap rows at the top', () => {
  const entries = buildEntries(commands, sections);
  const results = searchHelp("kil", entries, commands);
  const topLabels = results.slice(0, 2).map((r) => r.label);
  expect(topLabels.includes("&"), `expected "&" (kill-window) near the top, got ${JSON.stringify(topLabels)}`).toBeTruthy();
  expect(topLabels.includes("x"), `expected "x" (kill-pane) near the top, got ${JSON.stringify(topLabels)}`).toBeTruthy();
});

test('searchHelp: "dash" resolves to the dashboard COMMAND, not the "d / w / 0" keymap row whose description also contains "dashboard" (corpus-order tiebreak)', () => {
  const entries = buildEntries(commands, sections);
  const results = searchHelp("dash", entries, commands);
  expect(results[0].kind).toBe("command");
  expect(results[0].label).toBe("dashboard");
});

test('searchHelp: exact match ranks above a prefix match ("help" command vs. a longer field that merely starts with "help")', () => {
  const entries: typeof commands = [
    ...commands,
    { name: "helpful-thing", description: "not a real command" },
  ];
  const results = searchHelp("help", buildEntries(entries, []), entries);
  expect(results[0].label).toBe("help");
});

test('searchHelp: "rbt" subsequence-matches "reboot" with no better-tier competitor', () => {
  const entries = buildEntries(commands, sections);
  const results = searchHelp("rbt", entries, commands);
  expect(results[0].label).toBe("reboot");
});

test('searchHelp: "neof" prefix-matches the shell builtin "neofetch" (shell-builtins canary)', () => {
  const entries = buildEntries(commands, sections, shellRows);
  const results = searchHelp("neof", entries, commands);
  expect(results[0].kind).toBe("keymap");
  expect(results[0].label).toBe("neofetch");
});

test('searchHelp: "sudo" surfaces the shell builtin "sudo <...>"', () => {
  const entries = buildEntries(commands, sections, shellRows);
  const results = searchHelp("sudo", entries, commands);
  expect(results.some((r) => r.label === "sudo <...>")).toBeTruthy();
});

test("searchHelp: an empty/whitespace query returns no results (caller falls back to commandEntries instead)", () => {
  const entries = buildEntries(commands, sections);
  expect(searchHelp("", entries, commands)).toEqual([]);
  expect(searchHelp("   ", entries, commands)).toEqual([]);
});

test("searchHelp: caps results at the given limit", () => {
  const manyCommands: CommandSource[] = Array.from({ length: 20 }, (_, i) => ({
    name: `zz-match-${i}`,
    description: "zz-match filler row",
  }));
  const entries = buildEntries(manyCommands, []);
  const results = searchHelp("zz-match", entries, manyCommands, 10);
  expect(results.length).toBe(10);
});

test("searchHelp: matches a command's alias, not just its name", () => {
  const entries = buildEntries(commands, sections);
  const results = searchHelp("cv", entries, commands);
  expect(results.some((r) => r.label === "resume")).toBeTruthy();
});

test("searchHelp: word-boundary match on a later word within a description outranks an unrelated subsequence match", () => {
  const wordBoundarySections: HelpSectionSource[] = [
    { title: "Section A", rows: [{ key: "z", description: "status bar prompts a rename window dialog" }] },
    { title: "Section B", rows: [{ key: "y", description: "totally unrelated filler text with scattered letters" }] },
  ];
  const entries = buildEntries([], wordBoundarySections);
  const results = searchHelp("win", entries, []);
  expect(results[0].label).toBe("z");
});

test("searchHelp: determinism — identical input always returns identical output, including tie order", () => {
  const entries = buildEntries(commands, sections);
  const first = searchHelp("o", entries, commands);
  const second = searchHelp("o", entries, commands);
  expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
});

test("searchHelp: two equal-tier substring matches keep the original corpus order (stable ties)", () => {
  const tiedSections: HelpSectionSource[] = [
    { title: "S", rows: [{ key: "first", description: "contains zzzneedle here" }] },
  ];
  const tiedCommands: CommandSource[] = [{ name: "second-zzzneedle", description: "" }];
  const entries = buildEntries(tiedCommands, tiedSections);
  const results = searchHelp("zzzneedle", entries, tiedCommands);
  // Both are substring matches (neither is exact/prefix/word-boundary), so
  // corpus order (commands before keymap rows, per buildEntries) decides.
  expect(results.map((r) => r.label)).toEqual(["second-zzzneedle", "first"]);
});

// ---------------------------------------------------------------------
// levenshtein
// ---------------------------------------------------------------------

test("levenshtein: identical strings have distance 0", () => {
  expect(levenshtein("reboot", "reboot")).toBe(0);
});

test("levenshtein: one substitution has distance 1", () => {
  expect(levenshtein("cat", "cot")).toBe(1);
});

test("levenshtein: empty-string edge cases equal the other string's length", () => {
  expect(levenshtein("", "abc")).toBe(3);
  expect(levenshtein("abc", "")).toBe(3);
});
