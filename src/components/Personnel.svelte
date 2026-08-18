<script lang="ts">
  // Personnel Files (yazi clone) view — design/Homepage.dc.html lines
  // 274-336 (two-pane file browser: File Browser bottom-aligned entry list +
  // File Preview roles-table/doc pane) and the `xp*` state machine (lines
  // 899-907, 985-996, 1015-1102). Originally built 2-level, then 3-level
  // fixed (company -> employment type -> role file). PLAN.md Iteration 3
  // Phase 1 item 1.3 makes this DEPTH-GENERIC: the browser walks a real
  // directory tree of arbitrary depth, derived purely from each personnel
  // entry's on-disk path (`enaimco/software-developer/{role.md, full-time/
  // role.md, part-time/role.md, co-op/role.md}` — a directory that is
  // BOTH a role file's parent AND the parent of three more role
  // directories — and `memorial-university/<slug>/role.md` × 5, only one
  // level deep). Grouping is no longer frontmatter-driven (`company`/
  // `employmentType` are gone from content.config.ts's schema) — every
  // row at every depth comes from `buildTree()` below, walking each
  // entry's `filePath` relative to `src/content/personnel/`.
  //
  // Tree shape: a directory node's children are its OWN role.md file (if
  // it has one) first, then its subdirectories, each ordered by the
  // `order` frontmatter field (a directory's order = the minimum order of
  // any role file nested beneath it) — this reproduces the exact
  // `{role.md, full-time/, part-time/, co-op/}` listing order PLAN.md
  // Locked #9 specifies without hardcoding it: role.md sorts first because
  // files always precede directories, and full-time/part-time/co-op sort
  // by each's own `order` field (0/1/2 — most-recent-first, matching the
  // resume convention). The root's two directories (enaimco,
  // memorial-university) are ordered by companies.yaml instead, since
  // there's no role file order to fall back to at that level.
  //
  // `../` fidelity: the prototype appends a synthetic `../` entry to the
  // rendered list but — crucially — EXCLUDES it from the j/k selection
  // cycle (`list` never includes it), and hardcodes its `sel` to `false`.
  // Its click handler (`go`) is what actually performs "up one level, or
  // dashboard at the top" — clicking it always fires immediately (never a
  // "select first" step) precisely because `sel` can never be true for it.
  // This component reproduces that: `../` is rendered but never part of
  // the current directory's selection cycle, reachable only by mouse (its
  // own onclick) or by the equivalent keyboard actions (h/Backspace/
  // ArrowLeft = up one level only, never dashboard — dashboard is
  // mouse-only via `../`'s click or the global chrome, see the q/Esc note
  // below). PLAN.md Locked #3 explicitly asks for a mouse-navigable `../`
  // at EVERY level, including one that reaches the dashboard from the
  // root directory listing — items 15/16 (Iteration 2) ban the `q`/Esc
  // KEYS for navigation, not click affordances.
  //
  // q/Esc: bare q/Esc are not navigation anywhere in this browser (only
  // the editor's own q/Esc, special-cased below, still closes something:
  // the editor overlay, back to the browser, never the dashboard).
  // Implemented here by simply not handling q/Esc in handleKey() while the
  // browser (not the editor) is showing: returning `false` lets the key
  // fall through Terminal.svelte's handleKey with no matching branch left
  // to catch it, at every depth, for free.
  //
  // `f` / click-to-filter: clicking the `>` prompt row enters filter mode
  // exactly like pressing `f` does (both call the same `enterFilterMode()`).
  // It overlays a live case-insensitive substring filter on the CURRENT
  // directory's entry names; `../` is always kept regardless of the query.
  // While typing, letter/nav-mnemonic keys (j/k/h/l/f/q/...) all type into
  // the query instead of navigating — only Escape (clear+exit), Enter
  // (confirm+exit typing, filter stays applied), Backspace (edit), and the
  // arrow keys (which aren't text input) retain their acting meaning even
  // while typing.
  //
  // Single-click activation: clicking ANY row (a directory, a role file, or
  // `../`) activates it immediately, same as pressing Enter on the
  // already-selected row would. `activateSelected()` (keyboard Enter/l/
  // ArrowRight) and the click handlers below both funnel through the same
  // `activateRow()` function — mouse and keyboard are identical by
  // construction, not two parallel implementations that could drift.
  import type { CollectionEntry } from "astro:content";
  import type { PersonnelData, CompanyEntry } from "../lib/data";
  import { classifyBody, colorFor } from "../lib/docline";
  import { pushPasteTarget, removePasteTarget } from "../lib/pasteTargets";
  import Editor, { type EditorLine } from "./Editor.svelte";

  type RoleEntry = CollectionEntry<"personnel">;

  interface Props {
    personnel: PersonnelData;
    companies: CompanyEntry[];
    personnelEntries: RoleEntry[];
    /** PLAN.md Iteration 3 Phase 6 item 6.1 — see PaneTree.svelte's own
     * header comment (multi-instance data-copy-source/paste-target
     * gating). */
    isFocused: boolean;
    onDashboard: () => void;
  }

  const { personnel, companies, personnelEntries, isFocused, onDashboard }: Props = $props();

  /** Directory segments straight off disk, relative to
   * `src/content/personnel/`, case-preserved — `entry.id` would normally be
   * github-slugger-lowercased by Astro's default glob() generateId (see
   * content.config.ts), but the personnel collection now overrides
   * `generateId` the same way `projects` already does, so `entry.id` IS the
   * exact relative path MINUS the `.md` extension. That extension-stripping
   * is exactly why the file's own basename must NOT be read off the last
   * segment of `entry.id` here (it would silently render as "role" instead
   * of "role.md") — see `fileNameOf` below, which reads the real on-disk
   * basename (extension included) from `filePath` instead. */
  function dirSegmentsOf(entry: RoleEntry): string[] {
    if (entry.id) return entry.id.split("/").slice(0, -1);
    const fp = entry.filePath ?? "";
    const marker = "personnel/";
    const idx = fp.lastIndexOf(marker);
    const rel = idx >= 0 ? fp.slice(idx + marker.length) : fp;
    return rel.replace(/\.md$/, "").split("/").slice(0, -1);
  }

  /** The file's own basename, case-preserved, WITH its `.md` extension —
   * every leaf in this tree is literally named `role.md` (PLAN.md Locked
   * #9's "lowercase dirs" tree), so this is what actually renders as the
   * row name and what `data-row-name`/click-to-open assertions match on. */
  function fileNameOf(entry: RoleEntry): string {
    const base = entry.filePath?.split("/").pop();
    return base ?? `${entry.id.split("/").pop()}.md`;
  }

  interface DirNode {
    kind: "dir";
    name: string;
    order: number;
    children: TreeNode[];
  }
  interface FileNode {
    kind: "file";
    name: string;
    order: number;
    entry: RoleEntry;
  }
  type TreeNode = DirNode | FileNode;

  function findOrCreateDir(children: TreeNode[], name: string): DirNode {
    const existing = children.find((c): c is DirNode => c.kind === "dir" && c.name === name);
    if (existing) return existing;
    const created: DirNode = { kind: "dir", name, order: Number.POSITIVE_INFINITY, children: [] };
    children.push(created);
    return created;
  }

  /** A directory's own display order = the minimum `order` of any role file
   * nested anywhere beneath it (computed bottom-up once the whole tree is
   * built) — this is what makes `full-time/`/`part-time/`/`co-op/` (each a
   * single-file directory) sort by that file's own `order` frontmatter
   * without any directory-level order field ever needing to be authored by
   * hand. Root-level directories are re-ordered separately from
   * `companies.yaml` afterward (see `buildTree()`). */
  function computeDirOrders(node: TreeNode): number {
    if (node.kind === "file") return node.order;
    if (node.children.length === 0) return node.order;
    node.order = Math.min(...node.children.map(computeDirOrders));
    return node.order;
  }

  /** Sort a directory's children: files always precede directories
   * (reproduces PLAN.md Locked #9's `{role.md, full-time/, part-time/,
   * co-op/}` listing order for free — role.md is the only FILE at that
   * level), then by `order` ascending within each group. */
  function sortChildren(children: TreeNode[]) {
    children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "file" ? -1 : 1;
      return a.order - b.order;
    });
    for (const c of children) if (c.kind === "dir") sortChildren(c.children);
  }

  const root: DirNode = $derived.by(() => {
    const r: DirNode = { kind: "dir", name: "", order: 0, children: [] };
    for (const entry of personnelEntries) {
      const dirSegments = dirSegmentsOf(entry);
      let dir = r;
      for (const seg of dirSegments) {
        dir = findOrCreateDir(dir.children, seg);
      }
      dir.children.push({ kind: "file", name: fileNameOf(entry), order: entry.data.order, entry });
    }
    computeDirOrders(r);
    // Root-level directories are ordered by companies.yaml, not by any
    // nested role file's order — overwrite what computeDirOrders derived
    // for exactly (and only) the root's direct children.
    const companyOrder = new Map(companies.map((c) => [c.name, c.order]));
    for (const c of r.children) {
      if (companyOrder.has(c.name)) c.order = companyOrder.get(c.name)!;
    }
    sortChildren(r.children);
    return r;
  });

  /** Every role file nested anywhere beneath `node`, in tree (sorted)
   * order — backs the preview pane's roles table when a directory row is
   * selected (PLAN.md: selecting a directory previews the full roles table
   * of everything nested under it, same "preview what you'd enter"
   * semantic the fixed-level model used at companies/types). */
  function leavesOf(node: TreeNode): RoleEntry[] {
    if (node.kind === "file") return [node.entry];
    return node.children.flatMap(leavesOf);
  }

  // ---------------------------------------------------------------------
  // Navigation state: a path of directory names from the root, plus a
  // selection-index stack (one entry per level ever descended into, popped
  // on ascend) so going UP restores exactly the ancestor directory's own
  // previous selection — the same behavior the old fixed per-level state
  // variables (companySel/typeSel/roleSel) gave for free at exactly 3
  // levels, generalized here to any depth. Descending is always a fresh
  // start at row 0 in the entered directory (also matching the old fixed
  // model's own `activateCompanyRow`/`activateTypeRow`, which reset the
  // next level's selection unconditionally on every descend) — only the
  // "go back up" direction remembers anything.
  // ---------------------------------------------------------------------

  let pathSegments = $state<string[]>([]);
  let sel = $state(0);
  let selStack: number[] = [];

  let editorOpen = $state(false);
  let editorRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    runExCommand: (cmd: string) => { recognized: boolean; error?: string };
  } | null>(null);

  let filterMode = $state(false);
  let filterQuery = $state("");

  /** gg/G double-tap state — same ~500ms window as Editor.svelte/
   * Builds.svelte's own gg/G. */
  let gPending = false;
  let gTimer: ReturnType<typeof setTimeout> | undefined;

  const currentDir = $derived.by((): DirNode => {
    let dir = root;
    for (const seg of pathSegments) {
      const next = dir.children.find((c): c is DirNode => c.kind === "dir" && c.name === seg);
      if (!next) return root;
      dir = next;
    }
    return dir;
  });

  interface Row {
    name: string;
    meta: string;
    node: TreeNode;
  }

  function roleCount(node: TreeNode): number {
    return leavesOf(node).length;
  }

  const rows = $derived(
    currentDir.children.map((node): Row => {
      if (node.kind === "file") {
        return { name: node.name, meta: node.entry.data.dates, node };
      }
      const n = roleCount(node);
      const meta = personnel.roleCountTemplate
        .replace("{n}", String(n))
        .replace("{word}", n > 1 ? personnel.roleWordPlural : personnel.roleWordSingular);
      return { name: `${node.name}/`, meta, node };
    }),
  );

  const filteredRows = $derived(
    filterQuery ? rows.filter((r) => r.name.toLowerCase().includes(filterQuery.toLowerCase())) : rows,
  );
  const selectedRow = $derived(filteredRows[sel] ?? null);
  const selectedNode = $derived(selectedRow?.node ?? null);
  const selectedIsFile = $derived(selectedNode?.kind === "file");
  const activeRoleEntry = $derived(
    selectedNode && selectedNode.kind === "file" ? selectedNode.entry : null,
  );

  const posN = $derived(filteredRows.length === 0 ? 0 : Math.min(sel, filteredRows.length - 1) + 1);
  const posText = $derived(personnel.posTemplate.replace("{n}", String(posN)).replace("{total}", String(filteredRows.length)));

  const pathText = $derived(
    pathSegments.length > 0 ? `${personnel.pathPrefix}${pathSegments.join("/")}/` : personnel.pathPrefix,
  );

  const hintText = $derived.by(() => {
    if (!selectedNode) return "";
    if (selectedNode.kind === "file") {
      return personnel.hints.atFile.replace("{file}", selectedNode.name);
    }
    const template = pathSegments.length === 0 ? personnel.hints.atRoot : personnel.hints.atDir;
    return template.replace("{dir}", selectedNode.name);
  });

  /** Preview pane, generalized: a selected DIRECTORY previews the roles
   * table of every role file nested beneath it (root selection == that
   * whole company's roles, a leaf-level type directory == just its one
   * role — the old level-0/level-1 behaviors collapse into this single
   * rule); a selected FILE shows its own doc. */
  const previewRoles = $derived(selectedNode && selectedNode.kind === "dir" ? leavesOf(selectedNode) : []);

  const docLines = $derived(activeRoleEntry ? classifyBody(activeRoleEntry.body ?? "", "personnel") : []);
  const previewDoc = $derived(docLines.map((l) => ({ t: l.t, style: colorFor(l.kind, "personnel") })));
  const editorLines = $derived.by((): EditorLine[] =>
    docLines.map((l, i) => ({ n: i + 1, t: l.t, style: colorFor(l.kind, "personnel") })),
  );
  const editorFileName = $derived(selectedNode?.kind === "file" ? selectedNode.name : "");
  const editorBreadcrumbLeft = $derived(pathSegments.join("/"));

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

  function clearFilter() {
    filterQuery = "";
    filterMode = false;
  }

  function enterFilterMode() {
    filterMode = true;
    gPending = false;
  }

  const FILTER_PASTE_TARGET_ID = "personnel-filter";

  /** Ctrl-b ] paste-target registration — active only while the filter
   * prompt is actually accepting keystrokes. */
  $effect(() => {
    if (!filterMode || !isFocused) return;
    pushPasteTarget({
      id: FILTER_PASTE_TARGET_ID,
      insert: (text: string) => {
        filterQuery += text;
        sel = 0;
      },
    });
    return () => removePasteTarget(FILTER_PASTE_TARGET_ID);
  });

  function moveSelection(dir: number) {
    const n = filteredRows.length;
    if (n === 0) return;
    sel = ((sel + dir) % n + n) % n;
  }

  /** gg/G — jump to the first/last row of `filteredRows` (filtered-list
   * aware: jumps within the filtered set, not the full unfiltered
   * directory listing). Nav-mode only (not while `filterMode` is active —
   * see handleKey(), where typed characters including "g"/"G" go straight
   * into the filter query instead, same as every other letter). */
  function jumpFirst() {
    if (filteredRows.length === 0) return;
    sel = 0;
  }
  function jumpLast() {
    const n = filteredRows.length;
    if (n === 0) return;
    sel = n - 1;
  }

  /** Descend into a directory (push the current selection so returning via
   * `upOneLevel`/`upOrDashboard` restores it, then enter with a fresh
   * selection) or open a role file in the editor. Reads the row directly
   * off `filteredRows[i]` rather than relying on `sel` having already been
   * set — this is what lets a single click on ANY row (not just the
   * currently-selected one) activate immediately, for both mouse and
   * keyboard callers, without any same-tick derived-read subtlety. */
  function activateRow(i: number) {
    const row = filteredRows[i];
    if (!row) return;
    if (row.node.kind === "file") {
      sel = i;
      editorOpen = true;
      return;
    }
    selStack.push(sel);
    pathSegments = [...pathSegments, row.node.name];
    sel = 0;
    clearFilter();
  }

  /** Enter/l/ArrowRight — `xpEnter()` (Homepage.dc.html line 905) — and the
   * shared target every click handler below funnels through too, so
   * keyboard and mouse activation are identical by construction. */
  function activateSelected() {
    activateRow(sel);
  }

  /** h/Backspace/ArrowLeft — up one level only, never the dashboard
   * (distinct from the `../` row's click action below). No-op at the
   * root, same as the old fixed model's level-0 behavior. */
  function upOneLevel() {
    if (pathSegments.length === 0) return;
    pathSegments = pathSegments.slice(0, -1);
    sel = selStack.pop() ?? 0;
    clearFilter();
  }

  /** The `../` row's own click action (Homepage.dc.html line 1031's `go`):
   * up one level, or the dashboard at the root. Only reachable by clicking
   * `../` (or the keyboard actions above for the "up one level" half) —
   * never via keyboard selection, since `../` is never part of the j/k
   * cycle (see file header comment). */
  function upOrDashboard() {
    if (pathSegments.length === 0) {
      onDashboard();
      return;
    }
    upOneLevel();
  }

  function closeEditor() {
    editorOpen = false;
    editorRef = null;
  }

  /** Single click on any row activates it immediately — no select-then-
   * activate. `i` is always an index into the CURRENT directory's filtered
   * rows, matching what's rendered. */
  function clickRow(i: number) {
    activateRow(i);
  }

  // ---------------------------------------------------------------------
  // Keymap
  // ---------------------------------------------------------------------

  /** Exposed for Terminal.svelte's delegation-order flip — same contract as
   * Builds.svelte's `isEditorOpen()`. */
  export function isEditorOpen(): boolean {
    return editorOpen;
  }

  /** Same forwarding contract as Builds.svelte's own `runEditorExCommand`
   * — see that file's doc comment. */
  export function runEditorExCommand(cmd: string): { recognized: boolean; error?: string } {
    if (!editorOpen || !editorRef) return { recognized: false };
    return editorRef.runExCommand(cmd);
  }

  export function handleKey(e: KeyboardEvent): boolean {
    // The editor now owns Esc itself (cancels visual/search/cmdline only,
    // never closes) and `:q`/`:q!` (via Editor.svelte's ex-cmdline) is the
    // only close path, wired to `closeEditor` below through `onClose`.
    if (editorOpen) {
      return editorRef ? editorRef.handleKey(e) : false;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (filterMode) {
      if (e.key === "Escape") {
        clearFilter();
        sel = 0;
        return true;
      }
      if (e.key === "Enter") {
        filterMode = false;
        return true;
      }
      if (e.key === "Backspace") {
        filterQuery = filterQuery.slice(0, -1);
        sel = 0;
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
        sel = 0;
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
    // q/Esc never navigates anywhere, at any depth.
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
    {isFocused}
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
        <div
          data-copy-source={isFocused ? "" : undefined}
          style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:3px"
        >
          {#each filteredRows as row, i (row.name)}
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
              style={rowStyle(i === sel)}
            >
              <span style="width:14px;flex:none;color:rgba(196,216,232,.55)"
                >{row.node.kind === "file" ? personnel.roleRowIcon : personnel.companyRowIcon}</span
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
          {#if !selectedIsFile}
            {#each previewRoles as r (r.id)}
              <div
                data-testid="personnel-role-table-row"
                style="display:grid;grid-template-columns:minmax(0,1fr) 170px 100px;gap:8px;align-items:baseline"
              >
                <span style="color:rgba(196,216,232,.85);text-wrap:pretty">{r.data.role}</span>
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
