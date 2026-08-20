<script lang="ts">
  // Employment Records (yazi clone) view — design/Homepage.dc.html lines
  // 274-336 (two-pane file browser: File Browser bottom-aligned entry list +
  // File Preview roles-table/doc pane) and the `xp*` state machine (lines
  // 899-907, 985-996, 1015-1102). This browser is DEPTH-GENERIC: it walks a
  // real directory tree of arbitrary depth, derived purely from each
  // personnel entry's on-disk path (`enaimco/software-developer/{role.md,
  // full-time/role.md, part-time/role.md, co-op/role.md}` — a directory
  // that is BOTH a role file's parent AND the parent of three more role
  // directories — and `memorial-university/<slug>/role.md` × 5, only one
  // level deep). Grouping is not frontmatter-driven (`company`/
  // `employmentType` are not in content.config.ts's schema) — every
  // row at every depth comes from `buildTree()` below, walking each
  // entry's `filePath` relative to `src/content/personnel/`.
  //
  // Tree shape: a directory node's children are its OWN role.md file (if
  // it has one) first, then its subdirectories, each ordered by the
  // `order` frontmatter field (a directory's order = the minimum order of
  // any role file nested beneath it) — this reproduces the exact
  // `{role.md, full-time/, part-time/, co-op/}` listing order without
  // hardcoding it: role.md sorts first because
  // files always precede directories, and full-time/part-time/co-op sort
  // by each's own `order` field (0/1/2 — most-recent-first, matching the
  // resume convention). The root's own directories (companies) sort
  // alphabetically by name instead, since there's no role file order to
  // fall back to at that level and no per-company frontmatter to read an
  // explicit order from.
  //
  // `../` fidelity: unlike the original prototype (which excluded `../`
  // from the j/k selection cycle entirely), `../` here is a REAL first
  // entry in `displayRows` whenever `pathSegments` is non-empty (never
  // shown in the root listing) — j/k reaches it like any other row, and
  // Enter/l/ArrowRight/click all activate it via `activateRow`'s "up"
  // branch, which calls the same `upOrDashboard()` the click handler always
  // called. `h`/Backspace/ArrowLeft remain a SEPARATE "up one level only,
  // never dashboard" action (`upOneLevel`) — the two paths only coincide in
  // practice because `../` is never rendered at the root, where the
  // dashboard-vs-ascend distinction would otherwise matter. `../` stays
  // mouse-navigable at every level, including one that reaches the
  // dashboard from the root; bare `q`/Esc KEYS are still banned for
  // navigation, but that doesn't affect click/Enter affordances on `../`
  // itself.
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
  import type { PersonnelData } from "../../lib/data";
  import { classifyBody, colorFor } from "../../lib/docline";
  import { pushPasteTarget, removePasteTarget } from "../../lib/pasteTargets";
  import { iconSvgForPath } from "../../lib/fileIcons";
  import Editor, { type EditorLine } from "../editor/Editor.svelte";

  type RoleEntry = CollectionEntry<"personnel">;

  interface Props {
    personnel: PersonnelData;
    personnelEntries: RoleEntry[];
    /** See PaneTree.svelte's own header comment (multi-instance
     * data-copy-source/paste-target gating). */
    isFocused: boolean;
    onDashboard: () => void;
  }

  const { personnel, personnelEntries, isFocused, onDashboard }: Props = $props();

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
   * every leaf in this tree is literally named `role.md` (a "lowercase
   * dirs" tree), so this is what actually renders as the
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
   * hand. Root-level directories are re-ordered alphabetically afterward,
   * overwriting this function's result for exactly the root's own
   * children (see the `root` derivation below). */
  function computeDirOrders(node: TreeNode): number {
    if (node.kind === "file") return node.order;
    if (node.children.length === 0) return node.order;
    node.order = Math.min(...node.children.map(computeDirOrders));
    return node.order;
  }

  /** Sort a directory's children: files always precede directories
   * (reproduces the `{role.md, full-time/, part-time/, co-op/}` listing
   * order for free — role.md is the only FILE at that level), then by
   * `order` ascending within each group. */
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
    // Root-level directories (companies) sort alphabetically by name, not
    // by any nested role file's order — a plain lexicographic compare, not
    // a locale-sensitive one, so the order is stable across environments.
    r.children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const c of r.children) if (c.kind === "dir") sortChildren(c.children);
    return r;
  });

  /** Every role file nested anywhere beneath `node`, in tree (sorted)
   * order — backs the preview pane's roles table when a directory row is
   * selected: selecting a directory previews the full roles table of
   * everything nested under it, the "preview what you'd enter" semantic. */
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

  const currentDir = $derived.by((): DirNode => {
    let dir = root;
    for (const seg of pathSegments) {
      const next = dir.children.find((c): c is DirNode => c.kind === "dir" && c.name === seg);
      if (!next) return root;
      dir = next;
    }
    return dir;
  });

  /** `../` is a REAL row inside the selectable array rather than a
   * hardcoded, keyboard-unreachable extra markup block. `kind`
   * distinguishes it from real tree rows (`node` is null for it) —
   * `displayRows` below always puts it at index 0 whenever one exists
   * (i.e. whenever `pathSegments` is non-empty; it is kept OUT of the root
   * listing entirely). */
  interface Row {
    name: string;
    meta: string;
    kind: "up" | "dir" | "file";
    node: TreeNode | null;
  }

  function roleCount(node: TreeNode): number {
    return leavesOf(node).length;
  }

  /** The current directory's own dir/file rows — never includes `../`, and
   * never filtered (filtering is applied separately below so `../` can
   * always be spliced back in regardless of the query, matching the
   * file-header comment's "`../` is always kept" contract). */
  const contentRows = $derived(
    currentDir.children.map((node): Row => {
      if (node.kind === "file") {
        return { name: node.name, meta: node.entry.data.dates, node, kind: "file" };
      }
      const n = roleCount(node);
      const meta = personnel.roleCountTemplate.replace("{n}", String(n));
      return { name: `${node.name}/`, meta, node, kind: "dir" };
    }),
  );

  const filteredContentRows = $derived(
    filterQuery
      ? contentRows.filter((r) => r.name.toLowerCase().includes(filterQuery.toLowerCase()))
      : contentRows,
  );

  /** Whenever we're below the root, `../` is a real first row. */
  const upRowVisible = $derived(pathSegments.length > 0);
  const upRow: Row = { name: personnel.upEntry.name, meta: "", node: null, kind: "up" };

  /** What's actually rendered AND what `sel`/keyboard navigation index
   * into — `../` (when present) is always index 0, ahead of every content
   * row, so k from the first content row lands on it and wraps naturally. */
  const displayRows = $derived(upRowVisible ? [upRow, ...filteredContentRows] : filteredContentRows);

  /** The index of the first CONTENT row (skipping `../` when present) —
   * every "reset selection" site below (descending into a fresh directory,
   * typing/backspacing/pasting into the filter query, gg) lands here
   * rather than on `../` itself, so existing "freshly entered/filtered
   * directory selects its first real entry" behavior is unchanged. Falls
   * back to `../` itself (index 0) on the degenerate case of an empty
   * directory/filter result with `../` still visible. */
  function firstContentSel(): number {
    if (filteredContentRows.length > 0) return upRowVisible ? 1 : 0;
    return 0;
  }

  const selectedRow = $derived(displayRows[sel] ?? null);
  const selectedNode = $derived(selectedRow?.node ?? null);
  const selectedIsFile = $derived(selectedNode?.kind === "file");
  const activeRoleEntry = $derived(
    selectedNode && selectedNode.kind === "file" ? selectedNode.entry : null,
  );

  /** Position indicator counts CONTENT rows only — `../` isn't "an entry"
   * for "n / total" purposes, so selecting it shows "0 / total" (same
   * convention the empty-filtered-list case already used: "0 / 0"). */
  const posN = $derived(
    !selectedRow || selectedRow.kind === "up" ? 0 : sel - (upRowVisible ? 1 : 0) + 1,
  );
  const posText = $derived(
    personnel.posTemplate.replace("{n}", String(posN)).replace("{total}", String(filteredContentRows.length)),
  );

  const hintText = $derived.by(() => {
    if (!selectedNode) return "";
    if (selectedNode.kind === "file") {
      return personnel.hints.atFile.replace("{file}", selectedNode.name);
    }
    const template = pathSegments.length === 0 ? personnel.hints.atRoot : personnel.hints.atDir;
    return template.replace("{dir}", selectedNode.name);
  });

  /** A selected DIRECTORY's preview is an `ls -l`-style listing of its
   * IMMEDIATE children only (not every leaf role nested arbitrarily deep
   * beneath it) — `permissions  shev  date  name` per row, name last, dirs
   * get `drwxr-xr-x` + a trailing `/`, files get `.rw-r--r--`. A selected
   * FILE still shows its own doc (`previewDoc` below). */
  interface LsRow {
    isDir: boolean;
    name: string;
    date: string;
  }

  /** Role `dates` frontmatter reads e.g. "May 2024 – Present" — the start
   * date (everything before the en dash) is what an `ls -l` "date" column
   * plausibly shows for a role FILE. */
  function startDateOf(dates: string): string {
    return dates.split("–")[0].trim();
  }

  /** A directory has no `dates` field of its own, so its listing date is
   * "plausible": the start date of whichever nested leaf role has the
   * lowest `order` (== most recent, the same convention `computeDirOrders`
   * already uses to give the directory itself an order). */
  function dirPlausibleDate(node: DirNode): string {
    const leaves = leavesOf(node);
    if (leaves.length === 0) return "";
    const mostRecent = leaves.reduce((a, b) => (a.data.order <= b.data.order ? a : b));
    return startDateOf(mostRecent.data.dates);
  }

  const previewLsRows = $derived.by((): LsRow[] => {
    if (!selectedNode || selectedNode.kind !== "dir") return [];
    return selectedNode.children.map((child): LsRow =>
      child.kind === "file"
        ? { isDir: false, name: child.name, date: startDateOf(child.entry.data.dates) }
        : { isDir: true, name: `${child.name}/`, date: dirPlausibleDate(child) },
    );
  });

  /** One padded, monospace-alignable string per row rather than separate
   * grid cells — each preview row must render as a single line, and
   * building one string (rather than several flex/grid
   * cells whose concatenated `textContent` would run permissions/owner/
   * date/name together with no separators) is what lets an e2e assertion
   * regex-match the rendered text directly. `shev`/date are both fixed-
   * width (4 and 8 chars respectively, since every `dates` start reads
   * "Mmm YYYY"), so two-space separators alone keep columns aligned. */
  function lsLine(row: LsRow): string {
    const perm = row.isDir ? "drwxr-xr-x" : ".rw-r--r--";
    return `${perm}  shev  ${row.date}  ${row.name}`;
  }

  /** Every preview row (this doc pane included) is strictly one line —
   * appended to each line's own color style from `colorFor`. */
  const ONE_LINE_STYLE = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0";
  const docLines = $derived(activeRoleEntry ? classifyBody(activeRoleEntry.body ?? "", "personnel") : []);
  const previewDoc = $derived(
    docLines.map((l) => ({ t: l.t, style: `${colorFor(l.kind, "personnel")};${ONE_LINE_STYLE}` })),
  );
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
  }

  const FILTER_PASTE_TARGET_ID = "employment-filter";

  /** Ctrl-b ] paste-target registration — active only while the filter
   * prompt is actually accepting keystrokes. */
  $effect(() => {
    if (!filterMode || !isFocused) return;
    pushPasteTarget({
      id: FILTER_PASTE_TARGET_ID,
      insert: (text: string) => {
        filterQuery += text;
        sel = firstContentSel();
      },
    });
    return () => removePasteTarget(FILTER_PASTE_TARGET_ID);
  });

  function moveSelection(dir: number) {
    const n = displayRows.length;
    if (n === 0) return;
    sel = ((sel + dir) % n + n) % n;
  }

  /** Descend into a directory, ascend via the `../` row, or open a role
   * file in the editor. Reads the row directly off `displayRows[i]` rather
   * than relying on `sel` having already been set — this is what lets a
   * single click on ANY row (not just the currently-selected one) activate
   * immediately, for both mouse and keyboard callers, without any same-tick
   * derived-read subtlety. The `../` row is handled
   * right here, ahead of the dir/file branches, since it's a real member of
   * `displayRows` — no separate click handler needed. */
  function activateRow(i: number) {
    const row = displayRows[i];
    if (!row) return;
    if (row.kind === "up") {
      upOrDashboard();
      return;
    }
    if (row.node!.kind === "file") {
      sel = i;
      editorOpen = true;
      return;
    }
    selStack.push(sel);
    pathSegments = [...pathSegments, row.node!.name];
    clearFilter();
    sel = firstContentSel();
  }

  /** Enter/l/ArrowRight — `xpEnter()` (Homepage.dc.html line 905) — and the
   * shared target every click handler below funnels through too, so
   * keyboard and mouse activation are identical by construction. */
  function activateSelected() {
    activateRow(sel);
  }

  /** h/Backspace/ArrowLeft — up one level only, never the dashboard
   * (distinct from the `../` row's click action below). No-op at the
   * root. */
  function upOneLevel() {
    if (pathSegments.length === 0) return;
    pathSegments = pathSegments.slice(0, -1);
    sel = selStack.pop() ?? 0;
    clearFilter();
  }

  /** The `../` row's own activation (Homepage.dc.html line 1031's `go`):
   * up one level, or the dashboard at the root. `../` is a real,
   * keyboard-reachable row via `activateRow`'s "up" branch (Enter/l/
   * ArrowRight on it call this same function) as well as its own click
   * handler — mouse and keyboard funnel through the same place. The
   * dashboard half only ever fires from the root's OWN click/Enter on
   * `../`, since `../` is never rendered at the root in the first place
   * (`upRowVisible` is false there) — kept here as a defensive fallback,
   * not a reachable path in practice. */
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
   * Builds.svelte's `isEditorOpen()`. This export's name predates filter
   * mode, but its actual CONTRACT with Terminal.svelte is broader than "is
   * the vim Editor open" — it's really "does this pane currently own its
   * own text input, ahead of the grep-overlay `/`-opener and the
   * editor-scroll-chord gate" (see Terminal.svelte's
   * `paneIsGreedy`/`tryFocusedRef`). Filter mode is exactly that: while
   * `filterMode` is true every keystroke (including "/") must reach
   * `handleKey` below and land in the query, never open GrepOverlay out
   * from under it (see tests/e2e/employment.spec.ts's "filter mode" describe
   * block). Returning `true` here during filter mode makes EmploymentRecords
   * "greedy" the same way an open vim Editor already is, without
   * Terminal.svelte needing any changes of its own. */
  export function isEditorOpen(): boolean {
    return editorOpen || filterMode;
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
        sel = firstContentSel();
        return true;
      }
      if (e.key === "Enter") {
        filterMode = false;
        return true;
      }
      if (e.key === "Backspace") {
        filterQuery = filterQuery.slice(0, -1);
        sel = firstContentSel();
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
        sel = firstContentSel();
        return true;
      }
      return false;
    }

    const k = e.key.toLowerCase();

    if (k === "f") {
      enterFilterMode();
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
    if (e.key === "Enter" || k === "l" || e.key === "ArrowRight") {
      activateSelected();
      return true;
    }
    if (k === "h" || e.key === "Backspace" || e.key === "ArrowLeft") {
      upOneLevel();
      return true;
    }

    // q/Escape intentionally unhandled here: falls through to
    // Terminal.svelte with no matching branch left to catch it — bare
    // q/Esc never navigates anywhere, at any depth.
    return false;
  }
</script>

{#snippet folderIcon()}
  <svg
    data-icon="folder"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    ><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg
  >
{/snippet}

{#snippet upIcon()}
  <svg
    data-icon="up"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    ><path d="M9 14 4 9l5-5" /><path d="M4 9h10a5 5 0 0 1 5 5v6" /></svg
  >
{/snippet}

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
  <div style="flex:1;min-height:0;display:flex">
    <div style="flex:1;min-height:0;display:flex;gap:16px;padding:16px;font-size:13px">
      <!-- File Browser -->
      <div
        style="position:relative;flex:1;min-width:0;border:1px solid rgba(224,69,60,.35);border-radius:4px;padding:14px 12px 10px;display:flex;flex-direction:column"
      >
        <div
          data-copy-source={isFocused ? "" : undefined}
          style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:3px"
        >
          {#each displayRows as row, i (row.name)}
            <div
              role="button"
              tabindex="0"
              class="employment-row"
              data-testid={row.kind === "up" ? "employment-up-row" : "employment-row"}
              data-row-name={row.name}
              onclick={() => clickRow(i)}
              onkeydown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") clickRow(i);
              }}
              style={rowStyle(i === sel)}
            >
              <span style="width:14px;height:14px;flex:none;color:rgba(196,216,232,.55);display:inline-flex" aria-hidden="true">
                {#if row.kind === "file"}{@html iconSvgForPath(row.name)}{:else if row.kind === "dir"}{@render folderIcon()}{:else}{@render upIcon()}{/if}
              </span>
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{row.name}</span>
              <span style="flex:none;white-space:nowrap;color:rgba(95,198,180,.75)">{row.meta}</span>
            </div>
          {/each}
        </div>
        <div
          style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:#0a0e13;padding:0 10px;font-size:12px;color:rgba(224,69,60,.9)"
        >
          {personnel.insetTitles.fileBrowser}
        </div>
        <div
          role="button"
          tabindex="0"
          data-testid="employment-filter-row"
          onclick={enterFilterMode}
          onkeydown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") enterFilterMode();
          }}
          style="margin-top:10px;border:1px solid rgba(224,69,60,.35);border-radius:4px;padding:5px 10px;display:flex;justify-content:space-between;align-items:center;color:rgba(196,216,232,.5);cursor:pointer"
        >
          <span data-testid="employment-prompt" style="color:#5fc6b4"
            >{personnel.promptIcon} {filterQuery}{#if filterMode}<span
                data-testid="employment-filter-cursor"
                style="display:inline-block;width:7px;height:13px;vertical-align:-2px;background:#5fc6b4;animation:blk 1.1s steps(1) infinite"
              ></span>{/if}</span
          >
          <span data-testid="employment-pos">{posText}</span>
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
        <div data-testid="employment-preview" style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:4px">
          {#if !selectedIsFile}
            {#each previewLsRows as r, i (i)}
              <div
                data-testid="employment-ls-row"
                style="white-space:pre;overflow:hidden;text-overflow:ellipsis;min-width:0;font-family:inherit;color:rgba(196,216,232,.85)"
              >{lsLine(r)}</div>
            {/each}
          {:else}
            {#each previewDoc as l, i (i)}
              <div data-testid="employment-doc-line" style={l.style}>{l.t}</div>
            {/each}
          {/if}
        </div>
        <div data-testid="employment-hint" style="padding-top:8px;font-size:12px;color:rgba(196,216,232,.4)">{hintText}</div>
      </div>
    </div>
  </div>
{/if}

<style>
  .employment-row:hover {
    background: rgba(224, 69, 60, 0.12);
  }
</style>
