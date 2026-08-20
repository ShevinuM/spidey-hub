// EmploymentRecordsState — the Employment Records (flat list + service
// timeline) view's reactive core. Rebuilt from scratch for v2 (Decision 12
// in PLAN.md): the old drill-down browser this replaced has no reactive
// core worth relocating — E1-E3 are a genuine rebuild in the target
// folder+state-class pattern established by RepositoriesState/
// NotificationsState, not a port.
import type { CollectionEntry } from "astro:content";
import type { PersonnelData } from "../../lib/data";
import { classifyBody, colorFor } from "../../lib/docline";
import { iconSvgForPath } from "../../lib/fileIcons";

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
 * (tests/visual/recipes.ts CLOCK_TIME) freezes it for goldens the same way
 * it freezes the status-bar clock — this module never imports src/lib/clock.ts
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
 * (now) = 28mo. Verified against every duration in the mockup's RECORDS
 * mock data (UI-Mockups/builds-page-design-review/Personnel.dc.html) at its
 * authored "now" of 2026-08-15 (tests/visual/recipes.ts CLOCK_TIME): all six
 * durations match this formula exactly. */
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

const ONE_LINE_STYLE = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0";

/** Every role file's own directory path relative to
 * `src/content/personnel/`, case-preserved (same `entry.id`-is-the-real-path
 * convention content.config.ts documents for this collection) minus the
 * trailing `role.md` segment. */
function dirSegmentsOf(entry: RoleEntry): string[] {
  return entry.id.split("/").slice(0, -1);
}

export class EmploymentRecordsState {
  sel = $state(0);

  constructor(
    private readonly personnelFn: () => PersonnelData,
    private readonly personnelEntriesFn: () => RoleEntry[],
    private readonly fixtureModeFn: () => boolean,
  ) {}

  get fixtureMode(): boolean {
    return this.fixtureModeFn();
  }

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
   * reading is what makes the mockup's flat SIX-record list (and its
   * derived index stats) match the real collection exactly — see
   * docs/changes/employment-records-v2.md for the full rationale. One
   * consequence, called out there too: the three sub-role docs are not
   * reachable from this page now that drill-down is gone. */
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

  readonly docLines: DocLineView[] = $derived.by(() => {
    const rec = this.selected;
    if (!rec) return [];
    return classifyBody(rec.entry.body ?? "", "personnel").map((l) => ({
      t: l.t,
      style: `${colorFor(l.kind, "personnel")};${ONE_LINE_STYLE}`,
    }));
  });

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

  /** `handleKey`'s contract mirrors Repositories/HelpView's own
   * exported `handleKey` — see EmploymentRecords.svelte's own doc comment
   * for why Enter is a harmless no-op here (still consumed, so it never
   * falls through to Terminal.svelte's own bindings) rather than opening
   * anything: this page has no drill-down and no embedded editor left to
   * open (Decision 7 in PLAN.md), and the preview panel already tracks the
   * selected row live. */
  handleKey(e: KeyboardEvent): boolean {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === "j" || e.key === "ArrowDown") {
      this.moveSelection(1);
      return true;
    }
    if (e.key === "k" || e.key === "ArrowUp") {
      this.moveSelection(-1);
      return true;
    }
    if (e.key === "Enter") return true;
    return false;
  }
}
