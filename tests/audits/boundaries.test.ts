// architecture.md R009 asks for the R004/R008 boundary rules — no feature imports
// another feature, `common/` never imports a feature, no feature imports
// `bootstrap/` — to be enforced by a fitness test rather than left to convention.
// This is that test.
//
// It scans source text instead of walking a resolved module graph because two
// whole classes of edge are invisible to a resolver-based tool here: a
// `?raw` query-suffixed specifier crossing a layer boundary (as
// `common/lib/data.ts` did into nine feature content files, until phase 15
// step 7 moved each loader feature-local), and a large share of the
// crossings living in `.astro` files. A graph tool that drops the query
// suffix or skips `.astro` reports a clean tree while those edges keep
// crossing. A text scan reads every scanned file type alike and keeps each
// specifier verbatim.
//
// What the scan matches, and nothing else: `from "…"`, bare `import "…"`,
// dynamic `import("…")` and `` import(`…`) ``, and `import.meta.glob("…")` —
// each in single or double quotes (backticks for the template-literal dynamic
// form). `import.meta.glob` needs its own pattern: the interposed `.meta.glob`
// stops the plain-import pattern from reaching the quote, which is exactly how
// `common/lib/commits.ts`'s eager glob into a feature's fixture folder — four
// static JSON imports once Vite compiles it — went undetected in this test's
// first commit.
//
// Two blind spots are known and deliberate. `require(…)` is not matched at all:
// the repo is ESM and has zero subjects in `src/`. CSS `@import "…"` is
// OVER-matched, because `\bimport` matches after the `@` — not in `.css` files,
// which `SCANNED_EXTENSIONS` never opens, but in a `<style>` block inside a
// scanned `.astro`/`.svelte` file. There is no live subject, and the direction
// is the safe one: a relative `@import` crossing a boundary would fail loudly
// rather than pass silently.
//
// `src/pages/**` is deliberately unguarded: none of the three rules polices it.
//
// Layer classification is deliberately LEXICAL — a specifier is normalized
// against its source file's directory and matched on the resulting path prefix.
// `fileExists` is injectable and used only to name the concrete target file in a
// failure message; it cannot change a verdict, because every extension
// candidate shares one directory prefix. That is not an oversight to be
// "fixed": it is what lets the non-vacuity proof below fire the detector at
// synthetic in-memory files instead of dirtying the tree.
//
// Every crossing that exists in the tree today is listed in ALLOWLIST with a
// date, a reason, and a disposition. The match is exact in BOTH directions: a
// detected edge with no entry fails, and an entry whose edge no longer exists
// in the code also fails. A merely-tolerated superset would let a deleted
// reach-in be restored without the gate noticing, and would make the entry
// count meaningless as a measure of how much coupling is left.
import { expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { dirname as posixDirname, join as posixJoin } from "node:path/posix";

const ROOT = join(import.meta.dirname, "../..");
const SRC_DIR = join(ROOT, "src");

/** Every extension that can carry an import specifier in this codebase. */
const SCANNED_EXTENSIONS = [".ts", ".mjs", ".js", ".svelte", ".astro"];

/** Extensions tried when resolving an extensionless specifier. `.svelte.ts`
 * is in the list because `./terminalState.svelte` names a runes module, not a
 * component — appending `.ts` to a `.svelte` specifier is a real case here. */
const RESOLUTION_SUFFIXES = ["", ".ts", ".js", ".mjs", ".svelte", ".astro", "/index.ts", "/index.js"];

/** Matches `from "…"`, bare `import "…"` and dynamic `import("…")`, in single
 * or double quotes. The specifier is captured verbatim — query suffix included,
 * because that is what the allowlist keys on. */
const SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"'\n]*)\1/g;

/** Matches `import.meta.glob("…")`, in single or double quotes. `\bimport\s*\(?`
 * cannot reach past `.meta.glob`, so this form needs a pattern of its own even
 * though an eager glob compiles to plain static imports. The glob star stays in
 * the captured specifier: the allowlist keys on the text as written. */
const GLOB_PATTERN = /\bimport\.meta\.glob\s*\(\s*(["'])([^"'\n]*)\1/g;

/** Matches the template-literal dynamic import `` import(`…`) ``. Interpolated
 * names come through verbatim (`@shikijs/langs/${name}`), which is harmless: a
 * specifier that does not start with `.` is not a relative crossing. */
const TEMPLATE_IMPORT_PATTERN = /\bimport\s*\(\s*(`)([^`\n]*)\1/g;

/** Every form the scan looks for. All three capture the quote as group 1 and the
 * specifier as group 2, so one loop can consume them. */
const SPECIFIER_PATTERNS = [SPECIFIER_PATTERN, GLOB_PATTERN, TEMPLATE_IMPORT_PATTERN];

type Layer =
  | { kind: "feature"; name: string }
  | { kind: "common" }
  | { kind: "bootstrap" }
  | { kind: "pages" }
  | { kind: "outside" };

/** One boundary-crossing import: where it is written, what it names, and which
 * of the three rules it breaks. */
type Edge = { source: string; specifier: string; rule: string };

/** A crossing somebody decided to keep, for now or for good. */
type AllowlistEntry = {
  /** Repo-relative path of the file containing the import. */
  source: string;
  /** The specifier exactly as written, query suffix included. */
  specifier: string;
  /** When the entry was added. */
  added: string;
  /** `TEMPORARY (…)` naming the step that deletes it, or `PERMANENT, DECIDED`. */
  disposition: string;
  reason: string;
};

const PANE_TREE_REASON =
  "`common/components/PaneTree.svelte` statically imports each feature's top-level view to render whichever pane is active, so the shared pane container knows the concrete feature set.";

const METER_REASON =
  "`common/components/Meter.svelte` reads its scale helpers from the profile feature, which owns them.";

const FIXTURE_GLOB_REASON =
  "`common/lib/commits.ts` composes its data source at build time: an eager `import.meta.glob` over the real `src/generated/commits/` snapshots and a second one over the repositories feature's fixture snapshots, selected by `process.env.PORTFOLIO_FIXTURES`. That is the PORTFOLIO_FIXTURES build-level composition mechanism, not feature knowledge — the module is server-only (guarded against island import) and the glob never runs in a browser. `build:fixtures`, and therefore the whole visual gate, depends on the fixture branch resolving, and moving the fixtures under `common/` or duplicating them per feature would buy no decoupling at any layer that runs. Kept deliberately and permanently.";

// Ruling R3.
const TEST_SUPPORT_REASON =
  "Shared Playwright fixtures must seed the same storage keys the features read, and duplicating those constants would let them drift silently. The reach-in stops being drift and becomes a decision with a date on it.";

const ALLOWLIST: AllowlistEntry[] = [
  // Six view reach-ins from the shared pane container.
  ...[
    "../../features/dashboard/components/Dashboard.svelte",
    "../../features/repositories/components/Repositories.svelte",
    "../../features/employment/components/EmploymentRecords.svelte",
    "../../features/profile/components/Profile.svelte",
    "../../features/help/components/HelpView.svelte",
    "../../features/shell-fs/components/Shell.svelte",
  ].map((specifier) => ({
    source: "src/common/components/PaneTree.svelte",
    specifier,
    added: "2026-09-14",
    disposition: "TEMPORARY (deleted by phase 15 step 8)",
    reason: PANE_TREE_REASON,
  })),

  {
    source: "src/common/components/Meter.svelte",
    specifier: "../../features/profile/lib/net",
    added: "2026-09-14",
    disposition: "TEMPORARY (deleted by phase 15 step 8)",
    reason: METER_REASON,
  },

  // The build-time fixture glob in the shared commits loader.
  {
    source: "src/common/lib/commits.ts",
    specifier: "../../features/repositories/tests/ui/support/commits/*.json",
    added: "2026-09-14",
    disposition: "PERMANENT, DECIDED",
    reason: FIXTURE_GLOB_REASON,
  },

  // Seven storage-key reach-ins from shared test support.
  ...(
    [
      ["src/common/tests/ui/support/fixtures.ts", "../../../../features/boot/lib/boot-state"],
      ["src/common/tests/ui/support/fixtures.ts", "../../../../features/notifications/lib/notification-store"],
      ["src/common/tests/ui/support/pipeline.mjs", "../../../../features/boot/lib/boot-state.ts"],
      ["src/common/tests/ui/support/pipeline.mjs", "../../../../features/notifications/lib/toast-seed.ts"],
      ["src/common/tests/ui/e2e/animations.spec.ts", "../../../../features/boot/lib/boot-state"],
      ["src/common/tests/ui/e2e/animations.spec.ts", "../../../../features/notifications/lib/notification-store"],
      ["src/common/tests/ui/e2e/cmdline.spec.ts", "../../../../features/grep/lib/grep"],
    ] as const
  ).map(([source, specifier]) => ({
    source,
    specifier,
    added: "2026-09-14",
    disposition: "PERMANENT, DECIDED",
    reason: TEST_SUPPORT_REASON,
  })),
];

/** Recursively lists every scannable file under `dir`, as a repo-relative path. */
function listScannedFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listScannedFiles(full));
    } else if (SCANNED_EXTENSIONS.includes(extname(entry.name))) {
      out.push(full.slice(ROOT.length + 1));
    }
  }
  return out;
}

/** Which architectural layer a repo-relative path belongs to. */
function classify(path: string): Layer {
  const feature = /^src\/features\/([^/]+)\//.exec(path);
  if (feature) return { kind: "feature", name: feature[1] };
  if (path.startsWith("src/common/")) return { kind: "common" };
  if (path.startsWith("src/bootstrap/")) return { kind: "bootstrap" };
  if (path.startsWith("src/pages/")) return { kind: "pages" };
  return { kind: "outside" };
}

/** Resolves a relative specifier written in `source` to the repo-relative path
 * it names. The query suffix is stripped for resolution only. `fileExists`
 * picks the concrete file among the extension candidates so a failure message
 * can name it; it can never change the answer's layer, because every candidate
 * shares the same directory prefix. That is what lets the non-vacuity proof
 * pass in-memory files that are nowhere on disk. */
function resolveTarget(source: string, specifier: string, fileExists: (absPath: string) => boolean): string {
  const withoutQuery = specifier.split("?")[0];
  const lexical = posixJoin(posixDirname(source), withoutQuery);
  for (const suffix of RESOLUTION_SUFFIXES) {
    if (fileExists(join(ROOT, lexical + suffix))) return lexical + suffix;
  }
  return lexical;
}

/** The rule an import from `from` to `to` breaks, or `undefined` if it is legal.
 * Nothing polices `pages/`, and `bootstrap/` is allowed to import everything. */
function ruleViolatedBy(from: Layer, to: Layer): string | undefined {
  if (from.kind === "feature" && to.kind === "feature" && to.name !== from.name) {
    return "no feature imports another feature";
  }
  if (from.kind === "common" && to.kind === "feature") return "common never imports a feature";
  if (from.kind === "feature" && to.kind === "bootstrap") return "no feature imports bootstrap";
  return undefined;
}

/** Finds every boundary-crossing import in the given `{path, text}` pairs.
 * Pure over its inputs, so the non-vacuity proof can fire it at synthetic
 * files rather than by dirtying the tree. Edges are deduplicated by
 * `(source file, verbatim specifier)` — the same unit the allowlist keys on. */
export function findBoundaryCrossings(
  files: Array<{ path: string; text: string }>,
  fileExists: (absPath: string) => boolean = existsSync,
): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const { path, text } of files) {
    const from = classify(path);
    if (from.kind === "outside") continue;
    for (const pattern of SPECIFIER_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        const specifier = match[2];
        if (!specifier.startsWith(".")) continue;
        const rule = ruleViolatedBy(from, classify(resolveTarget(path, specifier, fileExists)));
        if (!rule) continue;
        const key = edgeKey(path, specifier);
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ source: path, specifier, rule });
      }
    }
  }
  return edges;
}

/** The allowlist unit: one edge, never one file. Keying by source file alone
 * would license every future reach-in from that file. */
function edgeKey(source: string, specifier: string): string {
  return `${source} -> ${specifier}`;
}

/** Compares detected edges against the allowlist in both directions. */
export function diffAgainstAllowlist(
  detected: Edge[],
  allowlist: AllowlistEntry[],
): { unlisted: string[]; stale: string[] } {
  const allowed = new Set(allowlist.map((entry) => edgeKey(entry.source, entry.specifier)));
  const live = new Set(detected.map((edge) => edgeKey(edge.source, edge.specifier)));
  return {
    unlisted: detected
      .filter((edge) => !allowed.has(edgeKey(edge.source, edge.specifier)))
      .map((edge) => `${edgeKey(edge.source, edge.specifier)} (breaks: ${edge.rule})`),
    stale: allowlist
      .filter((entry) => !live.has(edgeKey(entry.source, entry.specifier)))
      .map((entry) => edgeKey(entry.source, entry.specifier)),
  };
}

test("every boundary crossing in src/ is an allowlisted edge, and every allowlisted edge still exists", () => {
  const files = listScannedFiles(SRC_DIR).map((path) => ({
    path,
    text: readFileSync(join(ROOT, path), "utf8"),
  }));
  const { unlisted, stale } = diffAgainstAllowlist(findBoundaryCrossings(files), ALLOWLIST);

  expect(
    unlisted,
    `boundary crossing(s) with no allowlist entry — either remove the import or add a dated, reasoned entry: ${unlisted.join("; ")}`,
  ).toEqual([]);
  expect(
    stale,
    `stale allowlist entry/entries — this edge no longer exists in the code, so delete the entry instead of letting it license a future reach-in: ${stale.join("; ")}`,
  ).toEqual([]);
});

// R009's proof clause: a rule that passes vacuously is worse than no rule.
// `feature`->`feature` and `feature`->`bootstrap` have no live subject in this
// tree, so without this test two thirds of the gate would be untested. Passing
// `() => false` for `fileExists` also proves classification never depends on a
// file being on disk. The synthetic set covers one case per specifier form the
// scan claims to match — plain, `?raw`-suffixed, quoted dynamic,
// `import.meta.glob` and backtick dynamic — so a form the patterns stop seeing
// goes red here instead of quietly shrinking the gate, which is how the glob
// form escaped detection in the first place.
test("each boundary rule fires against a synthetic violation, and a stale entry is reported", () => {
  const synthetic = [
    {
      path: "src/features/grep/lib/synthetic.ts",
      text: `import { helpText } from "../../help/lib/help";`,
    },
    {
      path: "src/common/lib/synthetic.ts",
      text: `import { search } from "../../features/grep/lib/grep";`,
    },
    {
      path: "src/features/grep/components/Synthetic.svelte",
      text: `import { terminalState } from "../../../bootstrap/terminalState.svelte";`,
    },
    {
      path: "src/features/boot/lib/synthetic-dynamic.ts",
      text: `const mod = await import("../../notifications/lib/toast-seed");`,
    },
    {
      path: "src/common/lib/synthetic-raw.ts",
      text: `import "../../features/help/content/help.yaml?raw";`,
    },
    {
      path: "src/common/lib/synthetic-glob.ts",
      text: `const mods = import.meta.glob("../../features/grep/content/*.json", { eager: true });`,
    },
    {
      path: "src/features/help/lib/synthetic-template.ts",
      text: "const mod = await import(`../../grep/lib/grep`);",
    },
  ];

  const detected = findBoundaryCrossings(synthetic, () => false);
  expect(detected.map((edge) => `${edge.rule} | ${edge.source} -> ${edge.specifier}`).sort()).toEqual([
    "common never imports a feature | src/common/lib/synthetic-glob.ts -> ../../features/grep/content/*.json",
    "common never imports a feature | src/common/lib/synthetic-raw.ts -> ../../features/help/content/help.yaml?raw",
    "common never imports a feature | src/common/lib/synthetic.ts -> ../../features/grep/lib/grep",
    "no feature imports another feature | src/features/boot/lib/synthetic-dynamic.ts -> ../../notifications/lib/toast-seed",
    "no feature imports another feature | src/features/grep/lib/synthetic.ts -> ../../help/lib/help",
    "no feature imports another feature | src/features/help/lib/synthetic-template.ts -> ../../grep/lib/grep",
    "no feature imports bootstrap | src/features/grep/components/Synthetic.svelte -> ../../../bootstrap/terminalState.svelte",
  ]);

  // None of the seven is allowlisted, so all seven must be reported as unlisted.
  expect(diffAgainstAllowlist(detected, ALLOWLIST).unlisted).toHaveLength(7);

  // The other direction: an entry naming an edge no code contains is a failure,
  // which is what makes a deleted reach-in impossible to restore unnoticed.
  const stalePair = diffAgainstAllowlist([], [
    {
      source: "src/common/lib/data.ts",
      specifier: "../../features/removed/content/removed.yaml?raw",
      added: "2026-09-14",
      disposition: "TEMPORARY (synthetic)",
      reason: "Synthetic entry used to prove the stale-entry direction is not vacuous.",
    },
  ]);
  expect(stalePair.stale).toEqual([
    "src/common/lib/data.ts -> ../../features/removed/content/removed.yaml?raw",
  ]);
  expect(stalePair.unlisted).toEqual([]);
});
