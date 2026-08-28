// Pure scoring/search logic for the site-wide `?` fuzzy help palette —
// src/components/HelpSearch.svelte and Terminal.svelte own the
// stateful/effectful parts (open/close, typed text, Up/Down selection,
// executing a chosen command), exactly the same split src/lib/cmdline.ts
// already uses for Cmdline.svelte. No DOM, no Svelte state, no side effects.
//
// The palette's corpus is two different shapes glued together for search
// purposes (deliberately decoupled from src/lib/data.ts's YAML-loader
// types, same reasoning as src/lib/cmdline.ts's own CommandDef — this file
// stays a zero-dependency pure module):
//   - "command" entries: cmdline.yaml's own site-wide `commands` list
//     (dashboard/repositories/employment/profile/retina-v/help/grep/reboot/resume/q)
//     — EXECUTABLE (Enter runs the same action id Cmdline.svelte's own
//     onSubmit already dispatches through Terminal.svelte's
//     executeSiteAction). `q` is included with its exitProgram meaning
//     (site-mode `:q`/cmdline `q` exits the active pane's program to a
//     shell — it does not kill the window), same as every other command.
//   - "keymap" entries: every row of every help scope (src/content/help/
//     *.md, one file per scope), PLUS every row of src/data/shell.yaml's
//     own `help.rows` (the in-window shell's `cd`/`ls`/`cat`/.../
//     `neofetch`/`sudo`/... — see src/lib/shell.ts's `runCommand` "help"
//     case, which prints this exact same list inside the shell itself) —
//     INFORMATIONAL ONLY (Enter no-ops; see HelpSearch.svelte), same shape
//     as a help row (`{label, description}`), sourced from shell.yaml
//     rather than duplicated here.
//
// Scoring cascade: exact > prefix > word-boundary > substring
// > subsequence. The first four tiers all mean "the query occurs verbatim,
// character-for-character, somewhere relevant in the field" — there is
// zero fuzziness to measure between the query and its own verbatim
// occurrence, so each carries a fixed distance of 0. Only "subsequence"
// (characters present in order but not contiguous) is genuinely fuzzy, so
// that's the one tier where a real Levenshtein distance breaks ties
// between multiple subsequence matches (a small Levenshtein tiebreak).
// Every remaining tie (same tier, same distance) falls back to
// the entry's position in the corpus array passed in by the caller —
// commands are listed before keymap rows, both in their own yaml's
// declared order, so this is what makes e.g. "dash" resolve to the
// `dashboard` COMMAND rather than the "d / w / 0" keymap row whose
// description also happens to contain the word "dashboard" at the same
// tier/distance — fully deterministic, unit-tested below as
// "determinism/stability".

export interface CommandSource {
  name: string;
  aliases?: string[];
  description: string;
  action?: string;
  takesArgs?: boolean;
}

export interface HelpRowSource {
  key: string;
  description: string;
}

export interface HelpSectionSource {
  title: string;
  rows: HelpRowSource[];
}

/** shell.yaml's `help.rows[]` shape (src/lib/data.ts's `ShellHelpRow`,
 * structurally mirrored here rather than imported — same zero-dependency
 * convention as `CommandSource`/`HelpRowSource` above). */
export interface ShellHelpRowSource {
  cmd: string;
  description: string;
}

export interface HelpSearchCommandEntry {
  kind: "command";
  id: string;
  label: string;
  description: string;
  action: string | undefined;
  takesArgs: boolean;
}

export interface HelpSearchKeymapEntry {
  kind: "keymap";
  id: string;
  label: string;
  description: string;
}

export type HelpSearchEntry = HelpSearchCommandEntry | HelpSearchKeymapEntry;

/** cmdline.yaml's `commands` list (see file header) — this is BOTH the
 * empty-query listing and the "command" half of the typed-search corpus, in
 * the yaml's own declared order. `q` is included with its exitProgram
 * meaning (see file header). */
export function commandEntries(commands: CommandSource[]): HelpSearchCommandEntry[] {
  return commands
    .map((c) => ({
      kind: "command" as const,
      id: `cmd:${c.name}`,
      label: c.name,
      description: c.description,
      action: c.action,
      takesArgs: c.takesArgs ?? false,
    }));
}

/** Every row of every help scope, flattened, in scope order. Index (not
 * title text) anchors each id — two scopes could share a title in
 * principle, and a row's own text can change without breaking identity. */
export function keymapEntries(sections: HelpSectionSource[]): HelpSearchKeymapEntry[] {
  const out: HelpSearchKeymapEntry[] = [];
  sections.forEach((section, si) => {
    section.rows.forEach((row, ri) => {
      out.push({ kind: "keymap", id: `key:${si}:${ri}`, label: row.key, description: row.description });
    });
  });
  return out;
}

/** shell.yaml's own `help.rows[]` (see file header) as "keymap"-shaped
 * entries — `id`s are namespaced `shell:` (distinct from `keymapEntries`'s
 * `key:${si}:${ri}`) so the two sources can never collide. */
export function shellEntries(rows: ShellHelpRowSource[]): HelpSearchKeymapEntry[] {
  return rows.map((row, i) => ({ kind: "keymap", id: `shell:${i}`, label: row.cmd, description: row.description }));
}

/** The full corpus in the order ties resolve against — commands first
 * (see file header), then the help scopes' keymap rows, then the shell's
 * own builtins. `shellRows` defaults to `[]` so existing callers (and the
 * fixture-driven unit tests that predate shell.yaml) don't all need
 * updating in lockstep. */
export function buildEntries(
  commands: CommandSource[],
  sections: HelpSectionSource[],
  shellRows: ShellHelpRowSource[] = [],
): HelpSearchEntry[] {
  return [...commandEntries(commands), ...keymapEntries(sections), ...shellEntries(shellRows)];
}

// ---------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------

export type MatchTier = "exact" | "prefix" | "word-boundary" | "substring" | "subsequence";

const TIER_RANK: Record<MatchTier, number> = {
  exact: 0,
  prefix: 1,
  "word-boundary": 2,
  substring: 3,
  subsequence: 4,
};

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/** Classic Wagner–Fischer edit distance. Exported for direct unit testing;
 * only ever consulted here as the subsequence tier's tiebreak (see file
 * header) — never used to promote a worse tier over a better one. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from<number>({ length: n + 1 });
  let curr = Array.from<number>({ length: n + 1 });
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

interface FieldMatch {
  tier: MatchTier;
  distance: number;
}

function matchField(query: string, field: string): FieldMatch | null {
  const q = query.toLowerCase();
  const f = field.toLowerCase();
  if (!q || !f) return null;
  if (f === q) return { tier: "exact", distance: 0 };
  if (f.startsWith(q)) return { tier: "prefix", distance: 0 };
  const tokens = tokenize(f);
  if (tokens.some((t) => t === q || t.startsWith(q))) return { tier: "word-boundary", distance: 0 };
  if (f.includes(q)) return { tier: "substring", distance: 0 };
  if (isSubsequence(q, f)) return { tier: "subsequence", distance: levenshtein(q, f) / Math.max(f.length, 1) };
  return null;
}

function fieldsOf(entry: HelpSearchEntry): string[] {
  if (entry.kind === "command") return [entry.label, entry.description];
  return [entry.label, entry.description];
}

/** Also matches a command's aliases (name+aliases+description) — kept as a
 * separate helper since aliases aren't part of
 * `HelpSearchCommandEntry` (nothing renders them), only searched. */
function aliasFieldsOf(commands: CommandSource[], entry: HelpSearchEntry): string[] {
  if (entry.kind !== "command") return [];
  const src = commands.find((c) => c.name === entry.label);
  return src?.aliases ?? [];
}

function bestMatch(query: string, entry: HelpSearchEntry, commands: CommandSource[]): FieldMatch | null {
  let best: FieldMatch | null = null;
  for (const f of [...fieldsOf(entry), ...aliasFieldsOf(commands, entry)]) {
    const m = matchField(query, f);
    if (!m) continue;
    if (
      !best ||
      TIER_RANK[m.tier] < TIER_RANK[best.tier] ||
      (TIER_RANK[m.tier] === TIER_RANK[best.tier] && m.distance < best.distance)
    ) {
      best = m;
    }
  }
  return best;
}

/** Fuzzy-searches `entries` (as built by buildEntries, in that same order —
 * `commands` is passed again here only to reach alias text, see
 * aliasFieldsOf) and returns the top `limit` matches, ranked per the
 * cascade in the file header. An empty/whitespace-only `query` returns an
 * empty array — the CALLER picks the empty-query listing instead
 * (`commandEntries`), never this function: the empty-query behavior is
 * "list the commands", not "everything scores equally". */
export function searchHelp(
  query: string,
  entries: HelpSearchEntry[],
  commands: CommandSource[],
  limit = 10,
): HelpSearchEntry[] {
  const q = query.trim();
  if (!q) return [];
  const scored = entries
    .map((entry, index) => ({ entry, index, match: bestMatch(q, entry, commands) }))
    .filter((s): s is { entry: HelpSearchEntry; index: number; match: FieldMatch } => s.match !== null);
  scored.sort((a, b) => {
    const tierDiff = TIER_RANK[a.match.tier] - TIER_RANK[b.match.tier];
    if (tierDiff !== 0) return tierDiff;
    const distDiff = a.match.distance - b.match.distance;
    if (distDiff !== 0) return distDiff;
    return a.index - b.index;
  });
  return scored.slice(0, limit).map((s) => s.entry);
}
