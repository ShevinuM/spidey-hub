<script lang="ts">
  // Single Svelte island mounted by every route page (PLAN.md "Routing
  // assumption"): owns the view state machine, the global keymap, and
  // pushState/popstate URL sync. Astro SSRs this island with `initialView`
  // so the first paint matches the route with no client-side flash; all
  // view switches after that are client-side only.
  //
  // Later-phase views (builds/personnel/profile) render as empty
  // placeholders behind their view flag for now (PLAN.md Phase 3: "dashboard,
  // wallpaper, status bar, toasts, tracker-wallpaper opacity logic must be
  // COMPLETE" — the rest lands in Phases 4-7).
  import type { CollectionEntry } from "astro:content";
  import type {
    SiteData,
    DashboardData,
    TrackerData,
    ProfileData,
    BuildsData,
    PersonnelData,
    CompanyEntry,
    GrepData,
    HelpData,
    WindowEntry,
  } from "../lib/data";
  import type { Commit } from "../lib/commits";
  import type { ViewId } from "../lib/views";
  import { VIEW_ROUTES, activeWindowId, hotkeyToView, pathToView, windowIdToView } from "../lib/views";
  import { getPasteBuffer } from "../lib/pasteBuffer";
  import { getActivePasteTarget } from "../lib/pasteTargets";
  import Wallpaper from "./Wallpaper.svelte";
  import StatusBar from "./StatusBar.svelte";
  import Dashboard from "./Dashboard.svelte";
  import Toasts from "./Toasts.svelte";
  import Builds from "./Builds.svelte";
  import Personnel from "./Personnel.svelte";
  import Profile from "./Profile.svelte";
  import HelpView from "./HelpView.svelte";
  import GrepOverlay from "./GrepOverlay.svelte";
  import CopyMode from "./CopyMode.svelte";

  interface Props {
    initialView: ViewId;
    site: SiteData;
    dashboard: DashboardData;
    tracker: TrackerData;
    profile: ProfileData;
    builds: BuildsData;
    personnel: PersonnelData;
    companies: CompanyEntry[];
    grep: GrepData;
    help: HelpData;
    projects: CollectionEntry<"projects">[];
    personnelEntries: CollectionEntry<"personnel">[];
    commitsByRepo: Record<string, Commit[]>;
  }

  const {
    initialView,
    site,
    dashboard,
    tracker,
    profile,
    builds,
    personnel,
    companies,
    grep,
    help,
    projects,
    personnelEntries,
    commitsByRepo,
  }: Props = $props();

  /** Set by Builds.svelte's `bind:this` while `view === "builds"` — see
   * handleKey() below for the delegation contract (PLAN.md Phase 5).
   * `isEditorOpen` (PLAN.md Phase 3 item 10) reports whether its embedded
   * vim Editor is currently open, so this component's own handleKey can be
   * given a turn BEFORE GrepOverlay's — vim-faithful: `/` searches the
   * open buffer, not the site. */
  let buildsRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    isEditorOpen?: () => boolean;
    /** PLAN.md Phase 5 item 5.2 "Ctrl-b x" — kill-pane wiring: whether more
     * than one Builds panel is currently visible (if not, `x` falls back to
     * the kill-window flow instead — "in single-pane views, the only pane =
     * the window"), the focused panel's own title (for the confirm
     * prompt's `{pane}` text), and the actual removal. */
    canKillPane?: () => boolean;
    focusedPanelTitle?: () => string;
    killFocusedPane?: () => void;
  } | null>(null);
  /** Same `bind:this` + `handleKey(): boolean` + `isEditorOpen()` contract,
   * one level down — Personnel.svelte's own embedded Editor (PLAN.md Phase
   * 6, vim engine PLAN.md Phase 3). */
  let personnelRef = $state<{ handleKey: (e: KeyboardEvent) => boolean; isEditorOpen?: () => boolean } | null>(null);
  /** Same contract again — Profile.svelte only ever claims `r` (resume
   * download); everything else (including q/Esc) falls through to the
   * generic handling below (PLAN.md Phase 7). */
  let profileRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);
  /** Same contract again — HelpView.svelte only ever claims j/k scrolling
   * (PLAN.md Phase 1 item 13); everything else falls through unchanged. */
  let helpRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);
  /** GrepOverlay.svelte (PLAN.md Phase 8) — always mounted (see that file's
   * header comment), consulted ahead of every other ref above EXCEPT the
   * active view's own vim Editor when one is open (PLAN.md Phase 3's
   * delegation flip, see handleKey() below): this is what makes "/" open
   * the overlay from inside Builds/Personnel when no editor is open, and
   * what keeps the overlay's own keys (typing, nav, Enter/Esc) from ever
   * reaching the view underneath while it's open. */
  let grepRef = $state<{ handleKey: (e: KeyboardEvent) => boolean; close?: () => void } | null>(null);

  /** StatusBar's status-line prompt state machine (PLAN.md Phase 5 item
   * 5.1) — consulted at the very top of handleKey() below, ahead of even
   * the prefix-arm check, so a rename/confirm prompt truly owns the
   * keyboard the instant it opens. */
  let statusBarRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    isPromptActive: () => boolean;
    showMessage: (text: string) => void;
    startRename: (initial: string, onCommit: (name: string) => void) => void;
    startConfirm: (text: string, onYes: () => void) => void;
  } | null>(null);

  /** Ctrl-b [ copy-mode overlay (PLAN.md Phase 5 item 5.3) — same
   * always-mounted / bind:this / handleKey():boolean contract as
   * GrepOverlay, consulted right after the status-bar prompt. */
  let copyModeRef = $state<{ handleKey: (e: KeyboardEvent) => boolean; openOverlay: () => void } | null>(null);

  // Deliberately an "uncontrolled" seed, not a tracked binding: each route
  // page SSRs Terminal exactly once with the view matching its own URL, and
  // every subsequent view change is client-side (setView/popstate below) —
  // `initialView` itself never changes again for the lifetime of this
  // island, so there is nothing to re-sync. (svelte-autofixer flags this
  // shape as `state_referenced_locally` on any `$state(prop)` seed; that is
  // the documented pattern for uncontrolled initial values and is
  // intentional here.)
  // svelte-ignore state_referenced_locally
  let view = $state<ViewId>(initialView);
  let offDanger = $state(false);
  let offInfo = $state(false);

  // Mobile-block JS guard (README "Mobile policy"): listeners/timers only
  // attach while the viewport is desktop-sized with a fine pointer. The
  // full mobile card UI lands in Phase 9 — this is only the guard
  // architecture, kept reactive to live resizes.
  let desktopMode = $state(false);

  // Set once the real keydown/popstate listeners are attached (below).
  // Under real (non-faked) timers, hydration + the mobile-guard effects
  // are asynchronous relative to the initial SSR paint, so e2e tests wait
  // on `[data-terminal-ready="true"]` before dispatching any key — the SSR
  // markup itself (e.g. "SHEVINUM.DEV") is visible well before that and is
  // not a reliable "the app can handle input now" signal by itself.
  let keysReady = $state(false);

  $effect(() => {
    const mq = window.matchMedia("(min-width: 900px) and (pointer: fine)");
    desktopMode = mq.matches;
    const onChange = () => {
      desktopMode = mq.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });

  // Real, imperative (rather than `<svelte:window>`) listener attachment so
  // the mobile-block guard is literal: outside desktop+fine-pointer, no
  // keydown/popstate listener is ever registered, not merely a handler that
  // early-returns (README "Mobile policy" — verified by a Phase 9 e2e
  // marker check).
  $effect(() => {
    if (!desktopMode) return;
    window.addEventListener("keydown", handleKey);
    window.addEventListener("popstate", onPopState);
    keysReady = true;
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("popstate", onPopState);
      keysReady = false;
    };
  });

  /** Live, mutable window list (PLAN.md Phase 5 items 5.1/5.2) — seeded from
   * `site.statusBar.windows` but no longer read from it directly once
   * mounted: `Ctrl-b ,` mutates a window's `name` in place, `Ctrl-b &`
   * removes one entirely. In-memory only, exactly like a fresh tmux session
   * — a reload always starts back at the full 0-5 list from site.yaml. Each
   * entry is its own shallow clone so mutating one never touches the
   * original `site` prop object. */
  let windows = $state<WindowEntry[]>(site.statusBar.windows.map((w) => ({ ...w })));

  /** Closing the grep overlay is now folded into every view switch (PLAN.md
   * Phase 5 item 5.5: "grep is WINDOW chrome" — switching windows while
   * grep is open always closes it, whether the switch came from a
   * status-bar click, a prefix digit/n/p/d/w/0, or a kill-window that
   * happened to evict the current view). A no-op when grep isn't open. */
  function setView(next: ViewId) {
    grepRef?.close?.();
    if (next === view) return;
    view = next;
    history.pushState(null, "", VIEW_ROUTES[next]);
  }

  // ---------------------------------------------------------------------
  // tmux prefix (PLAN.md Phase 9 / README keymap, "Stated assumptions";
  // reordered by PLAN.md Phase 1 "Prefix precedence over grep" — see below).
  // Ctrl-b arms a 2s window during which the very next key is a
  // window-switch command instead of reaching any view. `prefixArmed`'s
  // dispatch branch is checked FIRST in handleKey() below, and the *arm*
  // check (bare Ctrl-b itself) is now checked SECOND — ahead of grep
  // delegation, tmux-faithful — so the prefix works even while the grep
  // overlay is open (needed for `Ctrl-b ]`'s paste into the grep query,
  // PLAN.md Phase 5 item 5.3). This retires the old "prefix inert while
  // grep is open" rule: while armed, the prefix consumes the next key
  // before grep ever sees it, exactly like every other view.
  //
  // PLAN.md Phase 5 item 5.2 "Ctrl-b ," / "&" / "x" / "[" / "]" — rename-
  // window, kill-window, kill-pane, copy-mode, and paste-buffer — are all
  // dispatched from `handlePrefixedKey` below alongside the pre-existing
  // digit/n/p/d/w/0 targets, since they're all "the single key following an
  // armed Ctrl-b" in exactly the same way.
  // ---------------------------------------------------------------------
  const NUMBER_TO_VIEW: Record<string, ViewId> = {
    "1": "builds",
    "2": "personnel",
    "3": "retina-v",
    "4": "profile",
    "5": "help",
  };
  const PREFIX_TIMEOUT_MS = 2000;

  /** n/p cycle order — the still-present windows, in their current (always
   * numeric, never reordered) order. A killed window simply drops out of
   * the cycle; nothing else about the ordering changes. */
  const prefixCycle = $derived(windows.map((w) => windowIdToView(w.id)));

  /** Digit/`?` targets, recomputed from the live `windows` list so a killed
   * window's digit stops doing anything (tmux-faithful: an unbound prefixed
   * key is silently swallowed) without needing a separate "is this window
   * still alive" check at every call site. */
  const prefixTargets = $derived.by((): Partial<Record<string, ViewId>> => {
    const present = new Set(windows.map((w) => w.id));
    const targets: Partial<Record<string, ViewId>> = {};
    for (const [digit, target] of Object.entries(NUMBER_TO_VIEW)) {
      if (present.has(target)) targets[digit] = target;
    }
    if (present.has("help")) targets["?"] = "help";
    return targets;
  });

  let prefixArmed = $state(false);
  let prefixTimer: ReturnType<typeof setTimeout> | undefined;

  function armPrefix() {
    prefixArmed = true;
    clearTimeout(prefixTimer);
    prefixTimer = setTimeout(() => {
      prefixArmed = false;
    }, PREFIX_TIMEOUT_MS);
  }

  function disarmPrefix() {
    prefixArmed = false;
    clearTimeout(prefixTimer);
  }

  /** n/p — next/prev window. Every window (including the dashboard, now a
   * real "0:dashboard" entry — PLAN.md Phase 1) is a `ViewId` in
   * `prefixCycle`, so this indexes `view` directly with no id-translation
   * layer needed. */
  function cyclePrefixView(dir: 1 | -1) {
    const cycle = prefixCycle;
    const idx = cycle.indexOf(view);
    const base = idx === -1 ? 0 : idx;
    const next = cycle[(base + dir + cycle.length) % cycle.length];
    if (next) setView(next);
  }

  /** The active window's own display name, for the rename prompt's
   * prefilled text and the kill-window/kill-pane confirm templates'
   * `{name}` substitution. */
  function currentWindowName(): string {
    const id = activeWindowId(view);
    return windows.find((w) => w.id === id)?.name ?? "";
  }

  /** Ctrl-b , — PLAN.md Phase 5 item 5.2. */
  function renameWindow(name: string) {
    const id = activeWindowId(view);
    windows = windows.map((w) => (w.id === id ? { ...w, name } : w));
  }

  /** Ctrl-b & (and the Builds single-pane Ctrl-b x fallback, and a
   * kill-pane that emptied the last Builds panel) — PLAN.md Phase 5 item
   * 5.2. Refuses (a status message, no removal) when only one window is
   * left; otherwise removes the active window and, if it WAS the active
   * one, switches to whatever now sits at its old index (i.e. the window
   * that used to be right after it — `remaining[idx]` — or wraps to the
   * first remaining window if it was last). Single source of behavior:
   * every "kill this window" path in the app funnels through here. */
  function killWindow() {
    if (windows.length <= 1) {
      statusBarRef?.showMessage(site.statusBar.prompts.killLastWindowMessage);
      return;
    }
    const id = activeWindowId(view);
    const idx = windows.findIndex((w) => w.id === id);
    const wasActive = idx !== -1;
    const remaining = windows.filter((w) => w.id !== id);
    windows = remaining;
    if (wasActive) {
      const fallback = remaining[idx] ?? remaining[0];
      if (fallback) setView(windowIdToView(fallback.id));
    }
  }

  function startRenamePrompt() {
    statusBarRef?.startRename(currentWindowName(), renameWindow);
  }

  function startKillWindowConfirm() {
    const text = site.statusBar.prompts.killWindowTemplate.replace("{name}", currentWindowName());
    statusBarRef?.startConfirm(text, killWindow);
  }

  /** Ctrl-b x — PLAN.md Phase 5 item 5.2: inside Builds with more than one
   * panel visible, confirms removing the FOCUSED panel only; everywhere
   * else (including Builds reduced to its last panel), "the only pane = the
   * window", so it's the exact same confirm/flow as Ctrl-b &. */
  function startKillPaneConfirm() {
    if (view === "builds" && buildsRef?.canKillPane?.()) {
      const pane = buildsRef.focusedPanelTitle?.() ?? "";
      const text = site.statusBar.prompts.killPaneTemplate.replace("{pane}", pane);
      statusBarRef?.startConfirm(text, () => buildsRef?.killFocusedPane?.());
      return;
    }
    startKillWindowConfirm();
  }

  /** Ctrl-b ] — PLAN.md Phase 5 item 5.3: inserts the shared paste buffer
   * into whichever text input is currently registered (src/lib/
   * pasteTargets.ts) — the grep query, the personnel filter, the rename
   * prompt, or the editor's in-buffer search. A transient status message
   * covers both "nothing is listening" and "nothing's been yanked yet". */
  function pasteFromBuffer() {
    const target = getActivePasteTarget();
    const buffer = getPasteBuffer();
    if (target && buffer) {
      target.insert(buffer.text);
      return;
    }
    statusBarRef?.showMessage(site.statusBar.prompts.pasteEmptyMessage);
  }

  /** The single key following an armed Ctrl-b. Always disarms. A held
   * modifier (e.g. Ctrl-d) is deliberately NOT treated as a prefix command
   * — disarm and fall through to the rest of handleKey unchanged, so e.g.
   * the Builds/Personnel editor's own Ctrl-d/Ctrl-u half-page scroll still
   * works immediately after an (unused) Ctrl-b, and the global "modifier
   * combos fall through untouched" rule holds even mid-prefix. (Ctrl-b
   * itself is special-cased one level up, in handleKey(), as tmux's own
   * "send-prefix" binding — see that function's comment — so it never
   * reaches this modifier check at all on the second press.) */
  function handlePrefixedKey(e: KeyboardEvent): boolean {
    disarmPrefix();
    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (e.key === "Escape") return true; // cancel — swallowed, no action

    const target = prefixTargets[e.key];
    if (target) {
      e.preventDefault();
      setView(target);
      return true;
    }

    const pk = e.key.toLowerCase();
    if (pk === "n") {
      e.preventDefault();
      cyclePrefixView(1);
      return true;
    }
    if (pk === "p") {
      e.preventDefault();
      cyclePrefixView(-1);
      return true;
    }
    if (pk === "d" || pk === "w" || e.key === "0") {
      e.preventDefault();
      setView("home");
      return true;
    }
    if (e.key === ",") {
      e.preventDefault();
      startRenamePrompt();
      return true;
    }
    if (e.key === "&") {
      e.preventDefault();
      startKillWindowConfirm();
      return true;
    }
    if (pk === "x") {
      e.preventDefault();
      startKillPaneConfirm();
      return true;
    }
    if (e.key === "[") {
      e.preventDefault();
      copyModeRef?.openOverlay();
      return true;
    }
    if (e.key === "]") {
      e.preventDefault();
      pasteFromBuffer();
      return true;
    }

    // Unrecognized prefixed key — tmux swallows it silently (no action);
    // only preventDefault a printable character (mirrors GrepOverlay's own
    // "swallow printable, let modifiers through" split).
    if (e.key.length === 1) e.preventDefault();
    return true;
  }

  function handleKey(e: KeyboardEvent) {
    // PLAN.md Phase 5 item 5.1: a status-line prompt (rename/confirm) OWNS
    // the keyboard the instant it's open — checked ahead of literally
    // everything else, including the prefix-arm check, so e.g. typing "j"
    // into a rename can never leak through to a list behind it. Item 5.3's
    // copy-mode overlay gets the same always-mounted / consulted-early
    // treatment as GrepOverlay, one step below the prompt.
    if (statusBarRef?.handleKey(e)) return;
    if (copyModeRef?.handleKey(e)) return;

    // A bare modifier keydown (Control/Shift/Alt/Meta pressed on its own,
    // with no other key) is never itself "a key" anywhere in this app's
    // keymap — critically, it must never be mistaken for "a modifier combo
    // held during an armed prefix" (which legitimately disarms, e.g.
    // Cmd+L): the browser fires a separate keydown for the Control key
    // itself just before the "b" keydown that carries `ctrlKey: true`, and
    // without this guard that Control-only event gets treated as exactly
    // such a disarming combo — breaking Ctrl-b Ctrl-b send-prefix entirely,
    // since the prefix is disarmed a keydown before the real second Ctrl-b
    // ever arrives.
    if (e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") return;

    // Ctrl-b Ctrl-b — tmux's own default "send-prefix" binding (PLAN.md
    // Phase 5 item 5.2): while armed, a SECOND Ctrl-b disarms (like any
    // other prefixed key) but, uniquely, does NOT stop there — it falls
    // through to the normal view-delegation chain below as a literal
    // keydown, which is what makes vim's own Ctrl-b (full-page-back,
    // `isEditorScrollChord` further down) reachable at all: a bare Ctrl-b
    // is otherwise always consumed by the prefix-arm branch first. This
    // replaces the old "pressing Ctrl-b again while armed just re-arms"
    // behavior — re-arming is still what happens for every OTHER prefixed
    // key (see `armPrefix()`'s own re-entrant reset), just not this one.
    let sendPrefixLiteral = false;
    if (prefixArmed) {
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "b") {
        disarmPrefix();
        sendPrefixLiteral = true;
      } else if (handlePrefixedKey(e)) {
        return;
      }
      // A modifier combo mid-prefix (any other Ctrl/Meta/Alt chord):
      // disarmed inside handlePrefixedKey above, deliberately falls through
      // to grep/view handling below as if no prefix were armed.
    }

    // Ctrl-b arms the tmux prefix (PLAN.md Phase 1 "Prefix precedence over
    // grep") — checked BEFORE grep delegation now, tmux-faithful: the
    // prefix works everywhere, including while the grep overlay is open
    // (needed for `Ctrl-b ]`'s paste into the grep query). Only Ctrl-b
    // itself is preventDefault-ed (global keymap rule: every other modifier
    // combo falls through untouched). Skipped when `sendPrefixLiteral` is
    // set above — this exact Ctrl-b keydown is the second half of a
    // send-prefix chord, not a fresh arm.
    if (!sendPrefixLiteral && e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      armPrefix();
      return;
    }

    // Ctrl-d/Ctrl-u/Ctrl-f/Ctrl-b are reserved for the Builds/Personnel file
    // editors' half/full-page scroll (PLAN.md Phase 5 "Editor scrolling",
    // extended by Phase 3's vim engine with Ctrl-f/b) — the one deliberate
    // exception to "modifier combos fall through untouched" so far (the
    // tmux prefix above is Ctrl-b itself, which is why a bare Ctrl-b never
    // reaches this chord check: it's always consumed by the prefix-arm
    // branch first — see the executor report for this known Ctrl-b/vim
    // overlap). Everything else still falls through untouched.
    const isEditorScrollChord =
      e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      (e.key === "d" || e.key === "D" || e.key === "u" || e.key === "U" || e.key === "f" || e.key === "F" || e.key === "b" || e.key === "B");

    /** Tries the active view's own ref (Builds/Personnel/Profile/Help),
     * subject to the same "no bare modifier combos except the editor
     * scroll chord" gate every ref has always used. Returns whether the
     * key was consumed. */
    function tryActiveViewRef(): boolean {
      if (view === "builds" && buildsRef && (isEditorScrollChord || !(e.metaKey || e.ctrlKey || e.altKey))) {
        if (buildsRef.handleKey(e)) {
          e.preventDefault();
          return true;
        }
      }
      if (view === "personnel" && personnelRef && (isEditorScrollChord || !(e.metaKey || e.ctrlKey || e.altKey))) {
        if (personnelRef.handleKey(e)) {
          e.preventDefault();
          return true;
        }
      }
      return false;
    }

    // PLAN.md Phase 3 "delegation flip": while the active view's vim Editor
    // is open, it must get first refusal ahead of GrepOverlay so `/`
    // searches the open buffer instead of opening grep — vim-faithful.
    // Everywhere else (no editor open), the original order holds: grep is
    // consulted first, exactly mirroring the prototype's own dispatch order
    // (Homepage.dc.html line 980: `if (this.state.grep) { this.grepKey(e);
    // return; }` runs before any view-specific handling), except that the
    // tmux prefix (above) now runs ahead of it per the retired "prefix
    // inert while grep open" rule.
    const editorIsOpen =
      (view === "builds" && !!buildsRef?.isEditorOpen?.()) || (view === "personnel" && !!personnelRef?.isEditorOpen?.());

    if (editorIsOpen && tryActiveViewRef()) {
      return;
    }

    // GrepOverlay.svelte owns "/" (open) and every key while it's already
    // open. GrepOverlay.handleKey() calls e.preventDefault() itself exactly
    // where the prototype's grepKey() does (see that file's header
    // comment) — never here — so an unrecognized modifier combo held while
    // the overlay is open (e.g. Cmd+L) still reaches the browser, it just
    // never reaches buildsRef/personnelRef/profileRef/helpRef or the
    // view-switch keys below.
    if (grepRef?.handleKey(e)) {
      return;
    }

    if (!editorIsOpen && tryActiveViewRef()) {
      return;
    }

    if (view === "profile" && profileRef && !(e.metaKey || e.ctrlKey || e.altKey)) {
      if (profileRef.handleKey(e)) {
        e.preventDefault();
        return;
      }
    }

    if (view === "help" && helpRef && !(e.metaKey || e.ctrlKey || e.altKey)) {
      if (helpRef.handleKey(e)) {
        e.preventDefault();
        return;
      }
    }

    // Modifier combos fall through untouched — never preventDefault them,
    // regardless of which view is active (PLAN.md keymap: "modifier-held
    // keys fall through untouched").
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key.toLowerCase();

    // PLAN.md Phase 1 items 15/16: bare q/Esc never switch views anywhere,
    // sitewide — navigation is tmux-prefix, status-bar clicks, or the
    // dashboard menu only. Esc is still handled above, but only as a
    // modal-exit key owned by grep/filter/prefix — never here. This
    // `return` still matters with the old q/Esc branch gone: it's what
    // keeps the dashboard-only hotkeys below from firing from any other
    // view.
    if (view !== "home") {
      return;
    }

    const target = hotkeyToView(k);
    if (target) setView(target);
  }

  function onPopState() {
    view = pathToView(location.pathname);
  }
</script>

<div
  data-terminal-ready={keysReady}
  style="position:relative;min-height:100vh;overflow:hidden;background:#0b0f14;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;color:#c9d1d9"
>
  <Wallpaper {tracker} {view} />

  <div style="position:relative;z-index:2;height:100vh;overflow:hidden;display:flex;flex-direction:column">
    <Toasts
      toasts={dashboard.toasts}
      {view}
      {offDanger}
      {offInfo}
      onHideDanger={() => (offDanger = true)}
      onHideInfo={() => (offInfo = true)}
    />

    {#if view === "home"}
      <Dashboard {dashboard} onSelect={setView} />
    {:else if view === "retina-v"}
      <!-- The full-opacity map/HUD is Wallpaper's own `view`-gated opacity
           (rendered once, behind every view, above) — PLAN.md Phase 1 items
           15/16 removed this view's only other content (the "[q] back to
           dashboard" pill); navigation is status-bar clicks / the tmux
           prefix / the dashboard menu now, so this branch is otherwise
           empty. The filler div keeps the flex column's layout identical to
           every other view (StatusBar still pinned to the bottom). -->
      <div style="flex:1;min-height:0"></div>
    {:else if view === "builds"}
      <Builds bind:this={buildsRef} {builds} {projects} {commitsByRepo} onTracker={() => setView("retina-v")} />
    {:else if view === "personnel"}
      <Personnel
        bind:this={personnelRef}
        {personnel}
        {companies}
        {personnelEntries}
        onDashboard={() => setView("home")}
      />
    {:else if view === "help"}
      <HelpView bind:this={helpRef} {help} />
    {:else}
      <Profile bind:this={profileRef} {profile} />
    {/if}

    <StatusBar bind:this={statusBarRef} {site} {windows} {view} onSelect={setView} />
  </div>

  <GrepOverlay bind:this={grepRef} {grep} onNavigate={setView} />
  <CopyMode bind:this={copyModeRef} copyMode={site.copyMode} />
</div>
