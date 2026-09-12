// EmploymentRecordsState — the Employment Records (flat list + service
// timeline) view's reactive core. Built from scratch in the folder +
// state-class pattern established by RepositoriesState/NotificationsState,
// not ported: the old drill-down browser this replaced had no reactive
// core worth relocating.
import type { CollectionEntry } from "astro:content";
import type { PersonnelData } from "../../../common/lib/data";
import { classifyBody, colorFor } from "../../../common/lib/docline";
import { iconSvgForPath } from "../../../common/lib/file-icons";

export type RoleEntry = CollectionEntry<"personnel">;

const MONTH_NUM: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

/** Parse a `dates` frontmatter half ("May 2024" or "Present") into a
 * {year, month} pair. `now` resolves "Present" — passed in (rather than read
 * via `new Date()` internally) purely so the one call site below can pass
 * a single shared instant for both halves of every record. Read at
 * component-mount time in the browser, so Playwright's `page.clock.install`
 * (common/tests/ui/support/recipes.ts CLOCK_TIME) freezes it for goldens
 * the same way it freezes the status-bar clock — this module never
 * imports src/common/lib/clock.ts
 * itself (that module's frozen epoch is for the tmux/session layer only),
 * but relies on the same underlying `Date` override. */
function parseMonthYear(raw: string, now: Date): { y: number; m: number } {
  const trimmed = raw.trim();
  if (trimmed === "Present") return { y: now.getFullYear(), m: now.getMonth() + 1 };
  const [monthName, yearStr] = trimmed.split(/\s+/);
  return { y: Number(yearStr), m: MONTH_NUM[monthName] ?? 1 };
}

/** `dates` frontmatter reads "May 2024 – Present" (en dash, spaces either
 * side) — split once, trim both halves. */
function splitDates(dates: string): [string, string] {
  const parts = dates.split("–");
  return [parts[0]?.trim() ?? "", parts[1]?.trim() ?? ""];
}

/** Inclusive month count between two {y,m} pairs, e.g. May 2024 -> Aug 2026
 * (now) = 28mo. Verified against all six real records' durations at the
 * frozen "now" of 2026-08-15 (common/tests/ui/support/recipes.ts
 * CLOCK_TIME): every one matches this formula exactly. */
function monthsBetween(start: { y: number; m: number }, end: { y: number; m: number }): number {
  return (end.y - start.y) * 12 + (end.m - start.m) + 1;
}

export interface EmploymentRow {
  entry: RoleEntry;
  /** Personnel collection top-level directory segment, e.g. "enaimco". */
  org: string;
  orgTag: string;
  /** Synthetic display filename — every real leaf on disk is literally
   * named `role.md` (content.config.ts), so this uses the role's own
   * directory slug instead (`software-developer.md`), matching the
   * mockup's naming convention for the flat list. */
  name: string;
  role: string;
  loc: string;
  dates: string;
  start: { y: number; m: number };
  end: { y: number; m: number };
  live: boolean;
  months: number;
  order: number;
  sizeBytes: number;
}

export interface IndexStats {
  orgs: number;
  longestMonths: number;
  yearsStart: number;
  yearsEnd: number;
}

interface DocLineView {
  t: string;
  style: string;
}

/** Wraps instead of clipping: a plain `<span>` blockified inside a flex row
 * (docline.ts's colours don't otherwise set `white-space`/`overflow`), so a
 * line longer than the panel's width wraps onto additional visual lines
 * rather than being cut off — every character stays visible regardless of
 * how long the source line is.
 *
 * `overflow-wrap:anywhere`, NOT `break-word` (found via the adversarial
 * 400-char-unbroken-line fixture, tests/visual/adversarial-fixtures.spec.ts):
 * `break-word` only affects
 * where a browser is willing to break a line during layout — it does NOT
 * reduce the element's min-content contribution to an ancestor flex
 * container's intrinsic size. A single unbroken (no-space) run long enough
 * therefore still forced this row's own flex ancestors, all the way up to
 * the 3-panel Records/Timeline/Preview flex row, to grow to fit it,
 * pushing the Timeline and Preview panels off-screen entirely.
 * `overflow-wrap:anywhere` is the form that also shrinks the min-content
 * size, so the flex layout no longer has to grow to accommodate it — this
 * is the same fix `PreviewPanel.svelte` (Repositories view) already uses
 * for its own preview text. */
const DOC_LINE_WRAP_STYLE = "white-space:normal;overflow-wrap:anywhere;min-width:0";

/** Every role file's own directory path relative to
 * `src/features/employment/content/personnel/`, case-preserved (same
 * `entry.id`-is-the-real-path convention content.config.ts documents for
 * this collection) minus the trailing `role.md` segment. */
function dirSegmentsOf(entry: RoleEntry): string[] {
  return entry.id.split("/").slice(0, -1);
}

export class EmploymentRecordsState {
  sel = $state(0);

  constructor(
    private readonly personnelFn: () => PersonnelData,
    private readonly personnelEntriesFn: () => RoleEntry[],
  ) {}

  get personnel(): PersonnelData {
    return this.personnelFn();
  }

  /** The flat, newest-first record list this page renders. Only ORG-LEVEL
   * role entries count as one record — `dirSegmentsOf().length === 2`
   * (`<org>/<role-slug>/role.md`) — not every leaf in the collection's
   * variable-depth tree. The enaimco software-developer position has since
   * been split into three sub-role leaves (full-time/part-time/co-op,
   * `length === 3`) alongside its own base `role.md`; including all of them
   * flat would double-count that position's own overlapping date ranges on
   * both the row list and the timeline, and the sub-role docs have no
   * standalone display name (every leaf is literally `role.md`). This
   * reading is what makes the flat record list (and its derived index
   * stats) match the real collection's six org-level positions exactly.
   * One consequence: the three sub-role docs are not reachable from this
   * page now that drill-down is gone. */
  readonly records: EmploymentRow[] = $derived.by(() => {
    const now = new Date();
    const personnel = this.personnelFn();
    const rows = this.personnelEntriesFn()
      .filter((entry) => dirSegmentsOf(entry).length === 2)
      .map((entry): EmploymentRow => {
        const [org, roleSlug] = dirSegmentsOf(entry);
        const [startRaw, endRaw] = splitDates(entry.data.dates);
        const start = parseMonthYear(startRaw, now);
        const end = parseMonthYear(endRaw, now);
        return {
          entry,
          org,
          orgTag: personnel.orgTags[org] ?? org.slice(0, 3),
          name: `${roleSlug}.md`,
          role: entry.data.role,
          loc: entry.data.loc,
          dates: entry.data.dates,
          start,
          end,
          live: endRaw.trim() === "Present",
          months: monthsBetween(start, end),
          order: entry.data.order,
          sizeBytes: new TextEncoder().encode(entry.body ?? "").length,
        };
      });
    rows.sort((a, b) => {
      if (a.start.y !== b.start.y) return b.start.y - a.start.y;
      if (a.start.m !== b.start.m) return b.start.m - a.start.m;
      return a.order - b.order;
    });
    return rows;
  });

  readonly indexStats: IndexStats = $derived.by(() => {
    const records = this.records;
    if (records.length === 0) return { orgs: 0, longestMonths: 0, yearsStart: 0, yearsEnd: 0 };
    return {
      orgs: new Set(records.map((r) => r.org)).size,
      longestMonths: Math.max(...records.map((r) => r.months)),
      yearsStart: Math.min(...records.map((r) => r.start.y)),
      yearsEnd: Math.max(...records.map((r) => r.end.y)),
    };
  });

  readonly selected: EmploymentRow | null = $derived(this.records[this.sel] ?? null);

  /** Raw classified body lines for the selected record — the shared source
   * both the always-visible preview panel AND the on-demand full-screen
   * editor render from (same `entry.body` `classifyBody("personnel")` call
   * the old drill-down browser made). */
  private readonly classifiedBody = $derived.by(() => {
    const rec = this.selected;
    return rec ? classifyBody(rec.entry.body ?? "", "personnel") : [];
  });

  readonly docLines: DocLineView[] = $derived(
    this.classifiedBody.map((l) => ({
      t: l.t,
      style: `${colorFor(l.kind, "personnel")};${DOC_LINE_WRAP_STYLE}`,
    })),
  );

  // ---------------------------------------------------------------------
  // Embedded editor — Enter opens the selected record's role.md in the
  // shared vim-lite Editor.svelte, same as the old drill-down browser did:
  // the `f` filter/drill-down/`../` are gone ("j/k/enter selection stays"),
  // but Enter's existing "open in the editor" behavior stays, reached in
  // one press now instead of a chain of drill-down Enters. "Harmless-open"
  // describes WHY this is safe to leave in — the buffer is always
  // readonly, so opening it can never lose the live preview/timeline sync
  // — not that Enter does nothing. Editor.svelte is entry-point-agnostic
  // (common/tests/ui/e2e/editor-vim.spec.ts parametrizes its own suite over
  // this page and Repositories'), so this mirrors RepositoriesState's
  // editorFile/editorRef/closeEditor shape exactly, minus the async fetch
  // (a role doc is already fully loaded).
  // ---------------------------------------------------------------------

  editorOpen = $state(false);
  editorRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    runExCommand: (cmd: string) => { recognized: boolean; error?: string };
  } | null>(null);

  readonly editorLines = $derived(
    this.classifiedBody.map((l, i) => ({ n: i + 1, t: l.t, style: colorFor(l.kind, "personnel") })),
  );

  readonly editorFileName = $derived(this.selected?.name ?? "");
  readonly editorBreadcrumbLeft = $derived(this.selected?.org ?? "");

  openEditor(): void {
    if (this.selected) this.editorOpen = true;
  }

  closeEditor(): void {
    this.editorOpen = false;
    this.editorRef = null;
  }

  iconFor(row: EmploymentRow): string {
    return iconSvgForPath(row.name);
  }

  moveSelection(delta: number): void {
    const n = this.records.length;
    if (n === 0) return;
    this.sel = (this.sel + delta + n) % n;
  }

  select(i: number): void {
    if (i >= 0 && i < this.records.length) this.sel = i;
  }

  /** `handleKey`'s contract mirrors Repositories.svelte's own exported
   * `handleKey`: while the editor is open, every key forwards to it
   * (`editorRef`) first. Closed: j/k/arrows move the flat-list selection
   * (preview + timeline follow live); Enter opens the editor. */
  handleKey(e: KeyboardEvent): boolean {
    if (this.editorOpen) {
      return this.editorRef ? this.editorRef.handleKey(e) : false;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === "j" || e.key === "ArrowDown") {
      this.moveSelection(1);
      return true;
    }
    if (e.key === "k" || e.key === "ArrowUp") {
      this.moveSelection(-1);
      return true;
    }
    if (e.key === "Enter") {
      this.openEditor();
      return true;
    }
    return false;
  }
}
