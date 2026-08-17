<script lang="ts">
  // Personnel Files (yazi clone) view — design/Homepage.dc.html lines
  // 274-336 (two-pane file browser: File Browser bottom-aligned entry list +
  // File Preview roles-table/doc pane) and the `xp*` state machine (lines
  // 899-907, 985-996, 1015-1102). PLAN.md Phase 6.
  //
  // Level model mirrors the prototype's `xpLevel` exactly: 0 = companies
  // (left pane lists companies, right pane PREVIEWS the currently selected
  // company's roles table — the prototype's own preview-pane behavior, not
  // an addition), 1 = roles (left pane lists the active company's role
  // files, right pane renders that role's doc via docline's "personnel"
  // mode / xpColors). Entering a role (Enter/l/ArrowRight at level 1) opens
  // the shared Editor.svelte (same bind:this + handleKey():boolean chain
  // Builds.svelte established for Phase 5 — see that file's header comment).
  //
  // `../` fidelity: the prototype appends a synthetic `../` entry to the
  // rendered list but — crucially — EXCLUDES it from the j/k selection
  // cycle (`list = xpLevel===1 ? company.roles : this.xp`, never the
  // concatenated array with `../`), and hardcodes its `sel` to `false`. Its
  // click handler (`go`) is what actually performs "up one level, or
  // dashboard at the top" — clicking it always fires immediately (never a
  // "select first" step) precisely because `sel` can never be true for it.
  // This component reproduces that: `../` is rendered but never part of
  // companySel/roleSel's range, reachable only by mouse (its own onclick)
  // or by the equivalent keyboard actions (h/Backspace/ArrowLeft = up one
  // level only, never dashboard; q/Esc = PLAN.md bug fix 3, see below).
  //
  // q/Esc (bug fix 3): the prototype's own key handler sends q/Esc at
  // xpLevel 1 up to level 0 (contradicting its own hint text, which always
  // says "q returns to the dashboard"). Bug fix 3 makes q/Esc always reach
  // the dashboard, at *both* levels — implemented here by simply not
  // handling q/Esc in handleKey() while the browser (not the editor) is
  // showing: returning `false` lets Terminal.svelte's own generic
  // `view !== "home"` -> q/Esc -> dashboard fallback fire, for both levels,
  // for free. Only the editor's q/Esc is special-cased below (closes the
  // editor back to the browser, not the dashboard).
  //
  // `f` filter mode is a PLAN.md "Stated assumption" (Personnel search) —
  // no prototype precedent. It overlays a live case-insensitive substring
  // filter on the current level's entry names; `../` is always kept
  // regardless of the query. While typing, letter/nav-mnemonic keys
  // (j/k/h/l/f/q/...) all type into the query instead of navigating — only
  // Escape (clear+exit), Enter (confirm+exit typing, filter stays applied),
  // Backspace (edit), and the arrow keys (which aren't text input) retain
  // their acting meaning even while typing.
  import type { CollectionEntry } from "astro:content";
  import type { PersonnelData, CompanyEntry } from "../lib/data";
  import { classifyBody, colorFor } from "../lib/docline";
  import Editor, { type EditorLine } from "./Editor.svelte";

  type RoleEntry = CollectionEntry<"personnel">;

  interface Props {
    personnel: PersonnelData;
    companies: CompanyEntry[];
    personnelEntries: RoleEntry[];
    onDashboard: () => void;
  }

  const { personnel, companies, personnelEntries, onDashboard }: Props = $props();

  /** Basename straight off disk, case-preserved — `entry.id` is
   * github-slugger-lowercased by Astro's default glob() generateId (see
   * content.config.ts's comment on the `projects` collection for the same
   * issue), which happens to be a no-op for these particular filenames
   * (already all-lowercase) but `filePath` is the correct source of truth
   * regardless, and is what the e2e suite compares against the real file on
   * disk. */
  function fileNameOf(entry: RoleEntry): string {
    const base = entry.filePath?.split("/").pop();
    return base ?? `${entry.id.split("/").pop()}.md`;
  }

  interface CompanyGroup {
    name: string;
    roles: RoleEntry[];
  }

  const sortedCompanies = $derived(
    [...companies]
      .sort((a, b) => a.order - b.order)
      .map(
        (c): CompanyGroup => ({
          name: c.name,
          roles: personnelEntries.filter((e) => e.data.company === c.name).sort((a, b) => a.data.order - b.data.order),
        }),
      ),
  );

  // ---------------------------------------------------------------------
  // Level / selection state
  // ---------------------------------------------------------------------

  let level = $state<0 | 1>(0);
  /** Index into `filteredCompanyRows` — NOT `sortedCompanies` directly, so
   * selection stays correct regardless of any active filter (see the
   * `selectedCompanyRow`/`activeCompanyGroup` derivation below, which reads
   * back through the filtered row's own `.company` reference rather than
   * re-indexing the unfiltered array). */
  let companySel = $state(0);
  let roleSel = $state(0);

  let editorOpen = $state(false);
  let editorRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  let filterMode = $state(false);
  let filterQuery = $state("");

  interface Row {
    name: string;
    meta: string;
  }
  interface CompanyRow extends Row {
    company: CompanyGroup;
  }
  interface RoleRow extends Row {
    entry: RoleEntry;
  }

  const companyRows = $derived(
    sortedCompanies.map(
      (c): CompanyRow => ({
        name: `${c.name}/`,
        meta: personnel.roleCountTemplate
          .replace("{n}", String(c.roles.length))
          .replace("{word}", c.roles.length > 1 ? personnel.roleWordPlural : personnel.roleWordSingular),
        company: c,
      }),
    ),
  );
  // The filter query only ever applies to the CURRENT level's rows (gated
  // by `level === 0` / `level === 1` below) — without that gate, typing a
  // roles-level query like "time" would also filter `filteredCompanyRows`
  // down to zero matches (no company name contains "time"), which would
  // then cascade through `selectedCompanyRow` -> `activeCompanyGroup` ->
  // `roleRows` and empty the roles list too, even though the query was
  // never meant to apply to companies at all.
  const filteredCompanyRows = $derived(
    level === 0 && filterQuery
      ? companyRows.filter((r) => r.name.toLowerCase().includes(filterQuery.toLowerCase()))
      : companyRows,
  );
  const selectedCompanyRow = $derived(filteredCompanyRows[companySel] ?? null);
  const activeCompanyGroup = $derived(selectedCompanyRow?.company ?? null);

  const roleRows = $derived(
    (activeCompanyGroup?.roles ?? []).map(
      (r): RoleRow => ({ name: fileNameOf(r), meta: r.data.months, entry: r }),
    ),
  );
  const filteredRoleRows = $derived(
    level === 1 && filterQuery
      ? roleRows.filter((r) => r.name.toLowerCase().includes(filterQuery.toLowerCase()))
      : roleRows,
  );
  const selectedRoleRow = $derived(filteredRoleRows[roleSel] ?? null);
  const activeRoleEntry = $derived(selectedRoleRow?.entry ?? null);

  const currentRows = $derived((level === 1 ? filteredRoleRows : filteredCompanyRows) as Row[]);
  const selIdx = $derived(level === 1 ? roleSel : companySel);

  const posN = $derived(currentRows.length === 0 ? 0 : Math.min(selIdx, currentRows.length - 1) + 1);
  const posText = $derived(
    personnel.posTemplate.replace("{n}", String(posN)).replace("{total}", String(currentRows.length)),
  );

  const pathText = $derived(
    level === 1 && activeCompanyGroup ? `${personnel.pathPrefix}${activeCompanyGroup.name}/` : personnel.pathPrefix,
  );

  const hintText = $derived(
    level === 1
      ? personnel.hints.atRoleLevel.replace("{file}", activeRoleEntry ? fileNameOf(activeRoleEntry) : "")
      : personnel.hints.atCompanyLevel.replace("{company}", activeCompanyGroup?.name ?? ""),
  );

  const docLines = $derived(activeRoleEntry ? classifyBody(activeRoleEntry.body ?? "", "personnel") : []);
  const previewDoc = $derived(docLines.map((l) => ({ t: l.t, style: colorFor(l.kind, "personnel") })));
  const editorLines = $derived.by((): EditorLine[] =>
    docLines.map((l, i) => ({ n: i + 1, t: l.t, style: colorFor(l.kind, "personnel") })),
  );
  const editorFileName = $derived(activeRoleEntry ? fileNameOf(activeRoleEntry) : "");

  // ---------------------------------------------------------------------
  // Row styling (Homepage.dc.html line 1026: `rowBase` + sel/unsel colors)
  // ---------------------------------------------------------------------

  function rowStyle(selected: boolean): string {
    const base = "cursor:pointer;display:flex;align-items:baseline;gap:10px;padding:1px 6px;border-radius:2px;";
    return base + (selected ? "background:rgba(224,69,60,.2);color:#f4ece9" : "color:rgba(196,216,232,.7)");
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  function resetSelection() {
    if (level === 1) roleSel = 0;
    else companySel = 0;
  }

  function clearFilter() {
    filterQuery = "";
    filterMode = false;
  }

  function moveSelection(dir: number) {
    const n = currentRows.length;
    if (n === 0) return;
    if (level === 1) roleSel = ((roleSel + dir) % n + n) % n;
    else companySel = ((companySel + dir) % n + n) % n;
  }

  /** Enter/l/ArrowRight — `xpEnter()` (Homepage.dc.html line 905). */
  function activateSelected() {
    if (level === 0) {
      const group = activeCompanyGroup;
      if (!group) return;
      // `companySel` currently indexes `filteredCompanyRows`. Once we clear
      // the filter below, that same numeric index would point at a
      // different row in the (now restored) unfiltered `companyRows` list
      // — remap by name first so descending into a filtered selection
      // (e.g. filter "fre" -> Freelance is row 0 of 1) doesn't silently
      // land on whichever company happens to sit at that index in the
      // full list (e.g. Enaimco, the real row 0).
      companySel = Math.max(
        0,
        companyRows.findIndex((r) => r.company.name === group.name),
      );
      level = 1;
      roleSel = 0;
      clearFilter();
    } else {
      if (!activeRoleEntry) return;
      editorOpen = true;
    }
  }

  /** h/Backspace/ArrowLeft — up one level only, never the dashboard
   * (distinct from the `../` row's click action below). */
  function upOneLevel() {
    if (level === 1) {
      level = 0;
      clearFilter();
    }
  }

  /** The `../` row's own click action (Homepage.dc.html line 1031's `go`):
   * up one level at the roles view, or the dashboard at the companies
   * view. Only reachable by clicking `../` (or the keyboard actions above
   * for the "up one level" half) — never via keyboard selection, since
   * `../` is never part of the j/k cycle (see file header comment). */
  function upOrDashboard() {
    if (level === 1) {
      level = 0;
      clearFilter();
    } else {
      onDashboard();
    }
  }

  function closeEditor() {
    editorOpen = false;
    editorRef = null;
  }

  function clickCompanyRow(i: number) {
    if (i === companySel) activateSelected();
    else companySel = i;
  }
  function clickRoleRow(i: number) {
    if (i === roleSel) activateSelected();
    else roleSel = i;
  }
  function clickRow(i: number) {
    if (level === 1) clickRoleRow(i);
    else clickCompanyRow(i);
  }

  // ---------------------------------------------------------------------
  // Keymap
  // ---------------------------------------------------------------------

  export function handleKey(e: KeyboardEvent): boolean {
    if (editorOpen) {
      if (e.key === "Escape" || e.key.toLowerCase() === "q") {
        closeEditor();
        return true;
      }
      return editorRef ? editorRef.handleKey(e) : false;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (filterMode) {
      if (e.key === "Escape") {
        clearFilter();
        resetSelection();
        return true;
      }
      if (e.key === "Enter") {
        filterMode = false;
        return true;
      }
      if (e.key === "Backspace") {
        filterQuery = filterQuery.slice(0, -1);
        resetSelection();
        return true;
      }
      if (e.key === "ArrowDown") {
        moveSelection(1);
        return true;
      }
      if (e.key === "ArrowUp") {
        moveSelection(-1);
        return true;
      }
      if (e.key === "ArrowRight") {
        activateSelected();
        return true;
      }
      if (e.key === "ArrowLeft") {
        upOneLevel();
        return true;
      }
      if (e.key.length === 1) {
        filterQuery += e.key;
        resetSelection();
        return true;
      }
      return false;
    }

    const k = e.key.toLowerCase();

    if (k === "f") {
      filterMode = true;
      return true;
    }
    if (k === "j" || e.key === "ArrowDown") {
      moveSelection(1);
      return true;
    }
    if (k === "k" || e.key === "ArrowUp") {
      moveSelection(-1);
      return true;
    }
    if (e.key === "Enter" || k === "l" || e.key === "ArrowRight") {
      activateSelected();
      return true;
    }
    if (k === "h" || e.key === "Backspace" || e.key === "ArrowLeft") {
      upOneLevel();
      return true;
    }

    // q/Escape intentionally unhandled here: falls through to
    // Terminal.svelte's generic q/Esc-to-dashboard fallback (PLAN.md bug
    // fix 3 — always dashboard from the browser, at both levels).
    return false;
  }
</script>

{#if editorOpen}
  <Editor
    bind:this={editorRef}
    fileName={editorFileName}
    lines={editorLines}
    labels={personnel.editor}
    breadcrumbLeft={activeCompanyGroup?.name ?? ""}
    breadcrumbRight={editorFileName}
    onClose={closeEditor}
  />
{:else}
  <div style="flex:1;min-height:0;display:flex;padding:18px 22px 14px">
    <div
      style="flex:1;min-height:0;display:flex;gap:16px;background:rgba(9,13,18,.6);backdrop-filter:blur(3px);border:1px solid rgba(224,69,60,.35);border-radius:6px;padding:16px;font-size:13px;box-shadow:0 24px 80px rgba(0,0,0,.5)"
    >
      <!-- File Browser -->
      <div
        style="position:relative;flex:1;min-width:0;border:1px solid rgba(224,69,60,.35);border-radius:4px;padding:14px 12px 10px;display:flex;flex-direction:column"
      >
        <div
          data-testid="personnel-path"
          style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#0a0e13;padding:0 10px;font-size:12px;color:rgba(224,69,60,.9);white-space:nowrap"
        >
          {pathText}
        </div>
        <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:3px">
          {#each currentRows as row, i (row.name)}
            <div
              role="button"
              tabindex="0"
              class="personnel-row"
              data-testid="personnel-row"
              data-row-name={row.name}
              onclick={() => clickRow(i)}
              onkeydown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") clickRow(i);
              }}
              style={rowStyle(i === selIdx)}
            >
              <span style="width:14px;flex:none;color:rgba(196,216,232,.55)"
                >{level === 1 ? personnel.roleRowIcon : personnel.companyRowIcon}</span
              >
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{row.name}</span>
              <span style="flex:none;white-space:nowrap;color:rgba(95,198,180,.75)">{row.meta}</span>
            </div>
          {/each}
          <div
            role="button"
            tabindex="0"
            class="personnel-row"
            data-testid="personnel-up-row"
            onclick={upOrDashboard}
            onkeydown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") upOrDashboard();
            }}
            style={rowStyle(false)}
          >
            <span style="width:14px;flex:none;color:rgba(196,216,232,.55)">{personnel.upEntry.icon}</span>
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{personnel.upEntry.name}</span>
            <span style="flex:none;white-space:nowrap;color:rgba(95,198,180,.75)"></span>
          </div>
        </div>
        <div
          style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:#0a0e13;padding:0 10px;font-size:12px;color:rgba(224,69,60,.9)"
        >
          {personnel.insetTitles.fileBrowser}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;color:rgba(196,216,232,.5)">
          <span data-testid="personnel-prompt" style="color:#5fc6b4">{personnel.promptIcon} {filterQuery}<span
              style="display:inline-block;width:7px;height:13px;vertical-align:-2px;background:#5fc6b4;animation:blk 1.1s steps(1) infinite"
            ></span></span>
          <span data-testid="personnel-pos">{posText}</span>
        </div>
      </div>

      <!-- File Preview -->
      <div
        style="position:relative;flex:2;min-width:0;border:1px solid rgba(224,69,60,.35);border-radius:4px;padding:14px 14px 12px;display:flex;flex-direction:column"
      >
        <div
          style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#0a0e13;padding:0 10px;font-size:12px;color:rgba(224,69,60,.9)"
        >
          {personnel.insetTitles.filePreview}
        </div>
        <div data-testid="personnel-preview" style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:4px">
          {#if level === 0}
            {#each activeCompanyGroup?.roles ?? [] as r (r.id)}
              <div
                data-testid="personnel-role-table-row"
                style="display:grid;grid-template-columns:minmax(0,1fr) 44px 170px 100px;gap:8px;align-items:baseline"
              >
                <span style="color:rgba(196,216,232,.85);text-wrap:pretty">{r.data.role}</span>
                <span style="color:#5fc6b4;text-align:right">{r.data.months}</span>
                <span style="color:rgba(217,176,74,.85);white-space:nowrap">{r.data.dates}</span>
                <span style="color:rgba(196,216,232,.5)">{r.data.loc}</span>
              </div>
            {/each}
          {:else}
            {#each previewDoc as l, i (i)}
              <div style={l.style}>{l.t}</div>
            {/each}
          {/if}
        </div>
        <div data-testid="personnel-hint" style="padding-top:8px;font-size:12px;color:rgba(196,216,232,.4)">{hintText}</div>
      </div>
    </div>
  </div>
{/if}

<style>
  .personnel-row:hover {
    background: rgba(224, 69, 60, 0.12);
  }
</style>
