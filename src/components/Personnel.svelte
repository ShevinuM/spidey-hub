<script lang="ts">
  // Personnel Files (yazi clone) view — design/Homepage.dc.html lines
  // 274-336 (two-pane file browser: File Browser bottom-aligned entry list +
  // File Preview roles-table/doc pane) and the `xp*` state machine (lines
  // 899-907, 985-996, 1015-1102). PLAN.md Phase 6 (initial 2-level build),
  // reworked to 3 levels in Phase 2 of Iteration 2 (PLAN.md items 7/8/9).
  //
  // Level model: 0 = companies (left pane lists companies — now just
  // Enaimco — right pane PREVIEWS the currently selected company's full
  // roles table, flattened across all its employment types), 1 =
  // employment types (left pane lists the active company's types —
  // Full-Time/Part-Time/Co-op — right pane previews that type's roles
  // table, the same "preview what you'd enter" semantic one level up), 2 =
  // role files (left pane lists the active type's role files, right pane
  // renders that role's doc via docline's "personnel" mode / xpColors).
  // Entering a role (Enter/l/ArrowRight at level 2) opens the shared
  // Editor.svelte (same bind:this + handleKey():boolean chain Builds.svelte
  // established for Phase 5 — see that file's header comment).
  //
  // Grouping stays frontmatter-driven (`data.company` matched against
  // companies.yaml, `data.employmentType` grouped within a company), never
  // path-driven — content.config.ts's personnel schema requires
  // `employmentType` on every role precisely so this works regardless of
  // directory layout.
  //
  // `../` fidelity: the prototype appends a synthetic `../` entry to the
  // rendered list but — crucially — EXCLUDES it from the j/k selection
  // cycle (`list` never includes it), and hardcodes its `sel` to `false`.
  // Its click handler (`go`) is what actually performs "up one level, or
  // dashboard at the top" — clicking it always fires immediately (never a
  // "select first" step) precisely because `sel` can never be true for it.
  // This component reproduces that: `../` is rendered but never part of
  // companySel/typeSel/roleSel's range, reachable only by mouse (its own
  // onclick) or by the equivalent keyboard actions (h/Backspace/ArrowLeft =
  // up one level only, never dashboard — dashboard is mouse-only via `../`'s
  // click or the global chrome, see the q/Esc note below). PLAN.md Phase 2
  // item 7 explicitly asks for a mouse-navigable `../` at every level,
  // including one that reaches the dashboard from the companies root —
  // items 15/16 ban the `q`/Esc KEYS for navigation, not click affordances.
  //
  // q/Esc: PLAN.md Phase 1 items 15/16 ban bare q/Esc as navigation
  // sitewide — neither key does anything at any level of the browser (only
  // the editor's own q/Esc, special-cased below, still closes something:
  // the editor overlay, back to the browser, never the dashboard).
  // Implemented here by simply not handling q/Esc in handleKey() while the
  // browser (not the editor) is showing: returning `false` lets the key
  // fall through Terminal.svelte's handleKey with no matching branch left
  // to catch it, at every level, for free.
  //
  // `f` / click-to-filter: PLAN.md Phase 2 item 9 fixes the "search doesn't
  // type" report — clicking the `>` prompt row now enters filter mode
  // exactly like pressing `f` does (both call the same `enterFilterMode()`).
  // It overlays a live case-insensitive substring filter on the current
  // level's entry names; `../` is always kept regardless of the query.
  // While typing, letter/nav-mnemonic keys (j/k/h/l/f/q/...) all type into
  // the query instead of navigating — only Escape (clear+exit), Enter
  // (confirm+exit typing, filter stays applied), Backspace (edit), and the
  // arrow keys (which aren't text input) retain their acting meaning even
  // while typing.
  //
  // Single-click activation: PLAN.md Phase 2 item 9 replaces the old
  // select-then-activate double-click pattern at every level — clicking ANY
  // row (a company, a type, a role file, or `../`) activates it
  // immediately, same as pressing Enter on the already-selected row would.
  // `activateSelected()` (keyboard Enter/l/ArrowRight) and the click
  // handlers below both funnel through the same three `activate*Row(i)`
  // functions — mouse and keyboard are identical by construction, not two
  // parallel implementations that could drift.
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

  interface TypeGroup {
    name: string;
    roles: RoleEntry[];
  }

  interface CompanyGroup {
    name: string;
    /** Flattened across all employment types, sorted by `order` — used for
     * the level-0 preview table (unchanged behavior from the 2-level
     * model) and for the company row's role-count meta. */
    roles: RoleEntry[];
    /** Employment types, ordered by the `order` of their first (lowest-
     * order) role — derived from the existing role frontmatter, nothing
     * invented. */
    types: TypeGroup[];
  }

  const sortedCompanies = $derived(
    [...companies].sort((a, b) => a.order - b.order).map((c): CompanyGroup => {
      const roles = personnelEntries.filter((e) => e.data.company === c.name).sort((a, b) => a.data.order - b.data.order);
      // `roles` is already order-sorted, so a first-seen dedupe preserves
      // type order without needing a separate "type order" field.
      const typeNames = [...new Set(roles.map((r) => r.data.employmentType))];
      const types: TypeGroup[] = typeNames.map((name) => ({
        name,
        roles: roles.filter((r) => r.data.employmentType === name),
      }));
      return { name: c.name, roles, types };
    }),
  );

  // ---------------------------------------------------------------------
  // Level / selection state
  // ---------------------------------------------------------------------

  let level = $state<0 | 1 | 2>(0);
  /** Indices into the respective `filtered*Rows` arrays — NOT the
   * unfiltered row arrays directly, so selection stays correct regardless
   * of any active filter (see `selectedCompanyRow`/`activeCompanyGroup`
   * etc. below, which read back through the filtered row's own group/type
   * reference rather than re-indexing the unfiltered array). */
  let companySel = $state(0);
  let typeSel = $state(0);
  let roleSel = $state(0);

  let editorOpen = $state(false);
  let editorRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  let filterMode = $state(false);
  let filterQuery = $state("");

  /** gg/G double-tap state (PLAN.md Phase 9 "Vim extras") — same ~500ms
   * window as Editor.svelte/Builds.svelte's own gg/G. */
  let gPending = false;
  let gTimer: ReturnType<typeof setTimeout> | undefined;

  interface Row {
    name: string;
    meta: string;
  }
  interface CompanyRow extends Row {
    company: CompanyGroup;
  }
  interface TypeRow extends Row {
    type: TypeGroup;
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
  // by `level === 0/1/2` below) — without that gate, typing a roles-level
  // query would also filter the companies/types rows down, cascading
  // through the derivations below and emptying levels the query was never
  // meant to apply to.
  const filteredCompanyRows = $derived(
    level === 0 && filterQuery
      ? companyRows.filter((r) => r.name.toLowerCase().includes(filterQuery.toLowerCase()))
      : companyRows,
  );
  const selectedCompanyRow = $derived(filteredCompanyRows[companySel] ?? null);
  const activeCompanyGroup = $derived(selectedCompanyRow?.company ?? null);

  const typeRows = $derived(
    (activeCompanyGroup?.types ?? []).map(
      (t): TypeRow => ({
        name: `${t.name}/`,
        meta: personnel.typeRoleCountTemplate
          .replace("{n}", String(t.roles.length))
          .replace("{word}", t.roles.length > 1 ? personnel.roleWordPlural : personnel.roleWordSingular),
        type: t,
      }),
    ),
  );
  const filteredTypeRows = $derived(
    level === 1 && filterQuery
      ? typeRows.filter((r) => r.name.toLowerCase().includes(filterQuery.toLowerCase()))
      : typeRows,
  );
  const selectedTypeRow = $derived(filteredTypeRows[typeSel] ?? null);
  const activeTypeGroup = $derived(selectedTypeRow?.type ?? null);

  const roleRows = $derived(
    (activeTypeGroup?.roles ?? []).map((r): RoleRow => ({ name: fileNameOf(r), meta: r.data.months, entry: r })),
  );
  const filteredRoleRows = $derived(
    level === 2 && filterQuery
      ? roleRows.filter((r) => r.name.toLowerCase().includes(filterQuery.toLowerCase()))
      : roleRows,
  );
  const selectedRoleRow = $derived(filteredRoleRows[roleSel] ?? null);
  const activeRoleEntry = $derived(selectedRoleRow?.entry ?? null);

  const currentRows = $derived(
    (level === 2 ? filteredRoleRows : level === 1 ? filteredTypeRows : filteredCompanyRows) as Row[],
  );
  const selIdx = $derived(level === 2 ? roleSel : level === 1 ? typeSel : companySel);

  const posN = $derived(currentRows.length === 0 ? 0 : Math.min(selIdx, currentRows.length - 1) + 1);
  const posText = $derived(
    personnel.posTemplate.replace("{n}", String(posN)).replace("{total}", String(currentRows.length)),
  );

  const pathText = $derived(
    level === 2 && activeCompanyGroup && activeTypeGroup
      ? `${personnel.pathPrefix}${activeCompanyGroup.name}/${activeTypeGroup.name}/`
      : level === 1 && activeCompanyGroup
        ? `${personnel.pathPrefix}${activeCompanyGroup.name}/`
        : personnel.pathPrefix,
  );

  const hintText = $derived(
    level === 2
      ? personnel.hints.atRoleLevel.replace("{file}", activeRoleEntry ? fileNameOf(activeRoleEntry) : "")
      : level === 1
        ? personnel.hints.atTypeLevel.replace("{type}", activeTypeGroup?.name ?? "")
        : personnel.hints.atCompanyLevel.replace("{company}", activeCompanyGroup?.name ?? ""),
  );

  /** Level-0/1 preview table shows "what you'd enter" — the company's full
   * roles table at level 0, narrowed to the selected type's roles at level
   * 1 (same table markup, just a smaller slice). Level 2 shows the actual
   * doc. */
  const previewRoles = $derived(level === 1 ? (activeTypeGroup?.roles ?? []) : (activeCompanyGroup?.roles ?? []));

  const docLines = $derived(activeRoleEntry ? classifyBody(activeRoleEntry.body ?? "", "personnel") : []);
  const previewDoc = $derived(docLines.map((l) => ({ t: l.t, style: colorFor(l.kind, "personnel") })));
  const editorLines = $derived.by((): EditorLine[] =>
    docLines.map((l, i) => ({ n: i + 1, t: l.t, style: colorFor(l.kind, "personnel") })),
  );
  const editorFileName = $derived(activeRoleEntry ? fileNameOf(activeRoleEntry) : "");
  const editorBreadcrumbLeft = $derived(
    activeCompanyGroup && activeTypeGroup ? `${activeCompanyGroup.name}/${activeTypeGroup.name}` : "",
  );

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
    if (level === 2) roleSel = 0;
    else if (level === 1) typeSel = 0;
    else companySel = 0;
  }

  function clearFilter() {
    filterQuery = "";
    filterMode = false;
  }

  function enterFilterMode() {
    filterMode = true;
    gPending = false;
  }

  function moveSelection(dir: number) {
    const n = currentRows.length;
    if (n === 0) return;
    if (level === 2) roleSel = (((roleSel + dir) % n) + n) % n;
    else if (level === 1) typeSel = (((typeSel + dir) % n) + n) % n;
    else companySel = (((companySel + dir) % n) + n) % n;
  }

  /** gg/G — jump to the first/last row of `currentRows` (PLAN.md Phase 9
   * "Vim extras" — "filtered list aware": `currentRows` already reflects
   * whichever filter is active, same as moveSelection() above, so gg/G
   * jump within the filtered set, not the full unfiltered list). Nav-mode
   * only (not while `filterMode` is active — see handleKey(), where typed
   * characters including "g"/"G" go straight into the filter query
   * instead, same as every other letter). */
  function jumpFirst() {
    if (currentRows.length === 0) return;
    if (level === 2) roleSel = 0;
    else if (level === 1) typeSel = 0;
    else companySel = 0;
  }
  function jumpLast() {
    const n = currentRows.length;
    if (n === 0) return;
    if (level === 2) roleSel = n - 1;
    else if (level === 1) typeSel = n - 1;
    else companySel = n - 1;
  }

  /** Descend into a company (level 0 -> 1). Reads the row directly off
   * `filteredCompanyRows[i]` rather than relying on `companySel` having
   * already been set and re-derived — this is what lets a single click on
   * ANY row (not just the currently-selected one) activate immediately,
   * for both mouse and keyboard callers, without any same-tick derived-read
   * subtlety. */
  function activateCompanyRow(i: number) {
    const row = filteredCompanyRows[i];
    if (!row) return;
    // Remap by name (not raw index) before clearing the filter: `i` indexes
    // the FILTERED list, which may not equal the unfiltered `companyRows`
    // list post-clear (e.g. filtering "fre" -> a filtered company is row 0
    // but might not be unfiltered row 0).
    companySel = Math.max(
      0,
      companyRows.findIndex((r) => r.company.name === row.company.name),
    );
    level = 1;
    typeSel = 0;
    clearFilter();
  }

  /** Descend into an employment type (level 1 -> 2). Same remap-by-name
   * treatment as activateCompanyRow above. */
  function activateTypeRow(i: number) {
    const row = filteredTypeRows[i];
    if (!row) return;
    typeSel = Math.max(
      0,
      typeRows.findIndex((r) => r.type.name === row.type.name),
    );
    level = 2;
    roleSel = 0;
    clearFilter();
  }

  /** Open a role file in the editor (level 2, terminal — no further
   * descent, so no remap-and-clear-filter dance is needed here). */
  function activateRoleRow(i: number) {
    const row = filteredRoleRows[i];
    if (!row) return;
    roleSel = i;
    editorOpen = true;
  }

  /** Enter/l/ArrowRight — `xpEnter()` (Homepage.dc.html line 905) — and the
   * shared target every click handler below funnels through too, so
   * keyboard and mouse activation are identical by construction. */
  function activateSelected() {
    if (level === 0) activateCompanyRow(companySel);
    else if (level === 1) activateTypeRow(typeSel);
    else activateRoleRow(roleSel);
  }

  /** h/Backspace/ArrowLeft — up one level only, never the dashboard
   * (distinct from the `../` row's click action below). */
  function upOneLevel() {
    if (level === 2) {
      level = 1;
      clearFilter();
    } else if (level === 1) {
      level = 0;
      clearFilter();
    }
  }

  /** The `../` row's own click action (Homepage.dc.html line 1031's `go`):
   * up one level at the types/roles views, or the dashboard at the
   * companies view. Only reachable by clicking `../` (or the keyboard
   * actions above for the "up one level" half) — never via keyboard
   * selection, since `../` is never part of the j/k cycle (see file header
   * comment). */
  function upOrDashboard() {
    if (level === 2) {
      level = 1;
      clearFilter();
    } else if (level === 1) {
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

  /** Single click on any row (PLAN.md Phase 2 item 9) activates it
   * immediately — no more select-then-activate. `i` is always an index
   * into the CURRENT level's filtered rows, matching what's rendered. */
  function clickRow(i: number) {
    if (level === 2) activateRoleRow(i);
    else if (level === 1) activateTypeRow(i);
    else activateCompanyRow(i);
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
      enterFilterMode();
      return true;
    }
    if (k === "j" || e.key === "ArrowDown") {
      moveSelection(1);
      gPending = false;
      return true;
    }
    if (k === "k" || e.key === "ArrowUp") {
      moveSelection(-1);
      gPending = false;
      return true;
    }
    if (e.key === "Enter" || k === "l" || e.key === "ArrowRight") {
      activateSelected();
      gPending = false;
      return true;
    }
    if (k === "h" || e.key === "Backspace" || e.key === "ArrowLeft") {
      upOneLevel();
      gPending = false;
      return true;
    }
    if (e.key === "G") {
      jumpLast();
      gPending = false;
      return true;
    }
    if (e.key === "g") {
      if (gPending) {
        clearTimeout(gTimer);
        gPending = false;
        jumpFirst();
      } else {
        gPending = true;
        gTimer = setTimeout(() => (gPending = false), 500);
      }
      return true;
    }

    // q/Escape intentionally unhandled here: falls through to
    // Terminal.svelte with no matching branch left to catch it — bare
    // q/Esc never navigates anywhere (PLAN.md Phase 1 items 15/16), at any
    // of the 3 levels.
    gPending = false;
    return false;
  }
</script>

{#if editorOpen}
  <Editor
    bind:this={editorRef}
    fileName={editorFileName}
    lines={editorLines}
    labels={personnel.editor}
    breadcrumbLeft={editorBreadcrumbLeft}
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
                >{level === 2 ? personnel.roleRowIcon : personnel.companyRowIcon}</span
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
          <span
            role="button"
            tabindex="0"
            data-testid="personnel-prompt"
            onclick={enterFilterMode}
            onkeydown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") enterFilterMode();
            }}
            style="cursor:pointer;color:#5fc6b4"
            >{personnel.promptIcon} {filterQuery}<span
              style="display:inline-block;width:7px;height:13px;vertical-align:-2px;background:#5fc6b4;animation:blk 1.1s steps(1) infinite"
            ></span></span
          >
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
          {#if level < 2}
            {#each previewRoles as r (r.id)}
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
