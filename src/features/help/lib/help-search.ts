// Pure scoring module (no DOM, no Svelte state): ranks entries via a fixed
// tier cascade — exact > prefix > word-boundary > substring > subsequence —
// falling back to the entry's position in the caller-supplied corpus to
// break remaining ties, so results stay fully deterministic.

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

/** shell.yaml's `help.rows[]` shape (src/common/lib/data.ts's `ShellHelpRow`,
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

/** Serves as both the empty-query listing and the command half of the
 * typed-search corpus, in cmdline.yaml's declared order. */
export function commandEntries(commands: CommandSource[]): HelpSearchCommandEntry[] {
  return commands.map((c) => ({
    kind: "command" as const,
    id: `cmd:${c.name}`,
    label: c.name,
    description: c.description,
    action: c.action,
    takesArgs: c.takesArgs ?? false,
  }));
}

/** Flattens every row of every help scope, in scope order, anchoring each id
 * on index rather than title text so identity survives duplicate titles and
 * row-text edits. */
export function keymapEntries(sections: HelpSectionSource[]): HelpSearchKeymapEntry[] {
  const out: HelpSearchKeymapEntry[] = [];
  sections.forEach((section, si) => {
    section.rows.forEach((row, ri) => {
      out.push({
        kind: "keymap",
        id: `key:${si}:${ri}`,
        label: row.key,
        description: row.description,
      });
    });
  });
  return out;
}

/** shell.yaml's `help.rows[]` as "keymap"-shaped entries, `id`-namespaced
 * `shell:` so they can never collide with `keymapEntries`'s `key:${si}:${ri}`. */
export function shellEntries(rows: ShellHelpRowSource[]): HelpSearchKeymapEntry[] {
  return rows.map((row, i) => ({
    kind: "keymap",
    id: `shell:${i}`,
    label: row.cmd,
    description: row.description,
  }));
}

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
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/** Classic Wagner–Fischer edit distance, consulted only as the subsequence
 * tier's tiebreak — never to promote a worse tier over a better one. */
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
  if (isSubsequence(q, f))
    return { tier: "subsequence", distance: levenshtein(q, f) / Math.max(f.length, 1) };
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

function bestMatch(
  query: string,
  entry: HelpSearchEntry,
  commands: CommandSource[],
): FieldMatch | null {
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

/** Returns an empty array for an empty/whitespace-only query — callers use
 * `commandEntries` for the empty-query listing instead, since "no query"
 * means "list the commands", not "everything scores equally". */
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
    .filter(
      (s): s is { entry: HelpSearchEntry; index: number; match: FieldMatch } => s.match !== null,
    );
  scored.sort((a, b) => {
    const tierDiff = TIER_RANK[a.match.tier] - TIER_RANK[b.match.tier];
    if (tierDiff !== 0) return tierDiff;
    const distDiff = a.match.distance - b.match.distance;
    if (distDiff !== 0) return distDiff;
    return a.index - b.index;
  });
  return scored.slice(0, limit).map((s) => s.entry);
}
