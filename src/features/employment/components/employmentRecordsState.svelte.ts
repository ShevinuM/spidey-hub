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

/** Parses a `dates` frontmatter half ("May 2024" or "Present") into a
 * {year, month} pair, using the caller-supplied `now` so every record
 * resolves "Present" against one shared, freeze-able instant. */
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

/** `overflow-wrap:anywhere`, not `break-word`, shrinks this row's
 * min-content contribution so a single unbroken long line wraps instead
 * of forcing the 3-panel flex row to grow to fit it. */
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

  // "Harmless-open": Enter opens the record's role.md in the shared readonly
  // Editor.svelte, which can never desync from the live preview/timeline
  // since the buffer is never editable.
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

  /** Mirrors `Repositories.svelte`'s `handleKey` contract: while the editor
   * is open every key forwards to it first, otherwise j/k/arrows move the
   * selection and Enter opens the editor. */
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
