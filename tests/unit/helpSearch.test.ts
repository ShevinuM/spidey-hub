// Unit tests for the pure scoring/search logic behind the site-wide `?`
// fuzzy help palette (PLAN.md Iteration 3 Phase 3 item 3.5) —
// src/lib/helpSearch.ts. No DOM, no Svelte state: exercised against
// fixture command/section lists (not the real cmdline.yaml/help.yaml, same
// "shape, not wording" isolation tests/unit/cmdline.test.ts already uses)
// so this suite can't drift silently if either yaml's copy changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEntries,
  commandEntries,
  keymapEntries,
  levenshtein,
  searchHelp,
  type CommandSource,
  type HelpSectionSource,
} from "../../src/lib/helpSearch.ts";

const commands: CommandSource[] = [
  { name: "dashboard", aliases: ["home"], description: "jump to the dashboard", action: "view:home" },
  { name: "builds", description: "jump to Builds", action: "view:builds" },
  { name: "personnel", description: "jump to Personnel Files", action: "view:personnel" },
  { name: "profile", description: "jump to Profile", action: "view:profile" },
  { name: "retina-v", description: "jump to E.D.I.T.H: Retina-V", action: "view:retina-v" },
  { name: "help", description: "jump to Help", action: "view:help" },
  { name: "grep", description: "open the grep overlay", action: "grep", takesArgs: true },
  { name: "reboot", description: "replay the E.D.I.T.H boot sequence", action: "reboot" },
  { name: "resume", aliases: ["cv"], description: "download resume.pdf in a new tab", action: "resume" },
  { name: "q", description: "kill the current window", action: "kill-window" },
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

// ---------------------------------------------------------------------
// commandEntries / keymapEntries / buildEntries
// ---------------------------------------------------------------------

test("commandEntries excludes q (PLAN.md 3.3 empty-query listing + searchable corpus)", () => {
  const entries = commandEntries(commands);
  assert.equal(entries.length, commands.length - 1);
  assert.ok(!entries.some((e) => e.label === "q"));
});

test("commandEntries preserves cmdline.yaml's own declared order", () => {
  const entries = commandEntries(commands);
  assert.deepEqual(
    entries.map((e) => e.label),
    ["dashboard", "builds", "personnel", "profile", "retina-v", "help", "grep", "reboot", "resume"],
  );
});

test("keymapEntries flattens every section's rows in file order", () => {
  const entries = keymapEntries(sections);
  assert.equal(entries.length, 4);
  assert.deepEqual(
    entries.map((e) => e.label),
    ["&", "x", "d / w / 0", "/"],
  );
});

test("buildEntries puts commands before keymap rows", () => {
  const entries = buildEntries(commands, sections);
  assert.equal(entries.length, commandEntries(commands).length + keymapEntries(sections).length);
  assert.equal(entries[0].kind, "command");
  assert.equal(entries[entries.length - 1].kind, "keymap");
});

// ---------------------------------------------------------------------
// searchHelp — scoring cascade canaries
// ---------------------------------------------------------------------

test('searchHelp: "kil" ranks the kill-window and kill-pane keymap rows at the top', () => {
  const entries = buildEntries(commands, sections);
  const results = searchHelp("kil", entries, commands);
  const topLabels = results.slice(0, 2).map((r) => r.label);
  assert.ok(topLabels.includes("&"), `expected "&" (kill-window) near the top, got ${JSON.stringify(topLabels)}`);
  assert.ok(topLabels.includes("x"), `expected "x" (kill-pane) near the top, got ${JSON.stringify(topLabels)}`);
});

test('searchHelp: "dash" resolves to the dashboard COMMAND, not the "d / w / 0" keymap row whose description also contains "dashboard" (corpus-order tiebreak)', () => {
  const entries = buildEntries(commands, sections);
  const results = searchHelp("dash", entries, commands);
  assert.equal(results[0].kind, "command");
  assert.equal(results[0].label, "dashboard");
});

test('searchHelp: exact match ranks above a prefix match ("help" command vs. a longer field that merely starts with "help")', () => {
  const entries: typeof commands = [
    ...commands,
    { name: "helpful-thing", description: "not a real command", action: undefined },
  ];
  const results = searchHelp("help", buildEntries(entries, []), entries);
  assert.equal(results[0].label, "help");
});

test('searchHelp: "rbt" subsequence-matches "reboot" with no better-tier competitor', () => {
  const entries = buildEntries(commands, sections);
  const results = searchHelp("rbt", entries, commands);
  assert.equal(results[0].label, "reboot");
});

test("searchHelp: an empty/whitespace query returns no results (caller falls back to commandEntries instead)", () => {
  const entries = buildEntries(commands, sections);
  assert.deepEqual(searchHelp("", entries, commands), []);
  assert.deepEqual(searchHelp("   ", entries, commands), []);
});

test("searchHelp: caps results at the given limit", () => {
  const manyCommands: CommandSource[] = Array.from({ length: 20 }, (_, i) => ({
    name: `zz-match-${i}`,
    description: "zz-match filler row",
  }));
  const entries = buildEntries(manyCommands, []);
  const results = searchHelp("zz-match", entries, manyCommands, 10);
  assert.equal(results.length, 10);
});

test("searchHelp: matches a command's alias, not just its name", () => {
  const entries = buildEntries(commands, sections);
  const results = searchHelp("cv", entries, commands);
  assert.ok(results.some((r) => r.label === "resume"));
});

test("searchHelp: word-boundary match on a later word within a description outranks an unrelated subsequence match", () => {
  const wordBoundarySections: HelpSectionSource[] = [
    { title: "Section A", rows: [{ key: "z", description: "status bar prompts a rename window dialog" }] },
    { title: "Section B", rows: [{ key: "y", description: "totally unrelated filler text with scattered letters" }] },
  ];
  const entries = buildEntries([], wordBoundarySections);
  const results = searchHelp("win", entries, []);
  assert.equal(results[0].label, "z");
});

test("searchHelp: determinism — identical input always returns identical output, including tie order", () => {
  const entries = buildEntries(commands, sections);
  const first = searchHelp("o", entries, commands);
  const second = searchHelp("o", entries, commands);
  assert.deepEqual(
    first.map((r) => r.id),
    second.map((r) => r.id),
  );
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
  assert.deepEqual(
    results.map((r) => r.label),
    ["second-zzzneedle", "first"],
  );
});

// ---------------------------------------------------------------------
// levenshtein
// ---------------------------------------------------------------------

test("levenshtein: identical strings have distance 0", () => {
  assert.equal(levenshtein("reboot", "reboot"), 0);
});

test("levenshtein: one substitution has distance 1", () => {
  assert.equal(levenshtein("cat", "cot"), 1);
});

test("levenshtein: empty-string edge cases equal the other string's length", () => {
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("abc", ""), 3);
});
