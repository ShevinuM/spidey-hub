<script lang="ts">
  // Single Svelte island mounted by every route page (PLAN.md "Routing
  // assumption"): owns the tmux client/session/window/pane model
  // (src/lib/tmux.ts), the global keymap, and pushState/popstate URL sync.
  // Astro SSRs this island with `initialView` so the first paint matches the
  // route with no client-side flash; all window switches after that are
  // client-side only.
  //
  // PLAN.md Iteration 3 Phase 4 item 4.1: this file used to own a single
  // `view: ViewId` $state var driving a `{#if view === "home"}...` chain
  // directly. That's replaced by one `client: Client` $state object
  // (src/lib/tmux.ts) — sessions own windows, windows own a pane tree, panes
  // own a running program — rendered through <PaneTree>. `view`/
  // `activeWindowId` below are now DERIVED read models over that client,
  // kept only because Wallpaper's opacity/blur knob and the dashboard-only
  // hotkey gate are keyed off "which WINDOW (screen) is on-screen", a concept
  // distinct from "which PROGRAM its pane happens to be running" once a pane
  // can run any program (or a shell) in any window (Locked decision #5).
  import type { CollectionEntry } from "astro:content";
  import type {
    SiteData,
    DashboardData,
    NotificationsData,
    TrackerData,
    ProfileData,
    BuildsData,
    PersonnelData,
    CompanyEntry,
    GrepData,
    HelpData,
    BootData,
    CmdlineData,
    HelpSearchData,
  } from "../lib/data";
  import type { Commit } from "../lib/commits";
  import type { ViewId } from "../lib/views";
  import { VIEW_ROUTES, hotkeyToView, pathToView, programToViewId, viewIdToProgram, windowIdToView } from "../lib/views";
  import type { Client, ProgramName, Session } from "../lib/tmux";
  import { activeSessionOf, activeWindowOf, createFactoryClient, focusedPane, killWindow, renameWindowManual, selectWindowIndex } from "../lib/tmux";
  import { resolvePageEpoch } from "../lib/clock";
  import { getPasteBuffer } from "../lib/pasteBuffer";
  import { getActivePasteTarget } from "../lib/pasteTargets";
  import { parseInput, parseTmuxCommand, resolveCommand } from "../lib/cmdline";
  import { downloadResume } from "../lib/resume";
  import Wallpaper from "./Wallpaper.svelte";
  import StatusBar from "./StatusBar.svelte";
  import PaneTree from "./PaneTree.svelte";
  import Toasts from "./Toasts.svelte";
  import GrepOverlay from "./GrepOverlay.svelte";
  import CopyMode from "./CopyMode.svelte";
  import BootSequence from "./BootSequence.svelte";
  import Cmdline, { type CmdlineMode } from "./Cmdline.svelte";
  import HelpSearch from "./HelpSearch.svelte";

  /** The default (and, this phase, only) session's stable identity — a
   * synthetic internal id, distinct from its user-visible NAME
   * ("10.42.7.13", still a bare literal here per PLAN.md advisor guidance:
   * formalizing it as data is a Phase 5 question, when `tmux ls`/multiple
   * sessions actually need it). */
  const DEFAULT_SESSION_ID = "default";
  const DEFAULT_SESSION_NAME = "10.42.7.13";

  /** Unified optional-methods contract every mounted program component's
   * `bind:this` ref may expose — a superset of the four separate ref shapes
   * this file used to declare individually (buildsRef/personnelRef/
   * profileRef/helpRef), now that PaneTree.svelte's single ref registry
   * serves all of them through one lookup (PLAN.md "per-pane ref Map for
   * delegation"). Every field stays optional: Dashboard/retina-v export no
   * ref at all, Profile/HelpView only ever export `handleKey`, and only
   * Builds exports the kill-pane-related fields. */
  interface ProgramRef {
    handleKey?: (e: KeyboardEvent) => boolean;
    isEditorOpen?: () => boolean;
    runEditorExCommand?: (cmd: string) => { recognized: boolean; error?: string };
    canKillPane?: () => boolean;
    focusedPanelTitle?: () => string;
    killFocusedPane?: () => void;
    focusedPanelNumber?: () => 0 | 1 | 2 | 3 | 4;
    killPane?: (n: 0 | 1 | 2 | 3 | 4) => void;
  }

  interface Props {
    initialView: ViewId;
    site: SiteData;
    dashboard: DashboardData;
    notifications: NotificationsData;
    tracker: TrackerData;
    profile: ProfileData;
    builds: BuildsData;
    personnel: PersonnelData;
    companies: CompanyEntry[];
    grep: GrepData;
    help: HelpData;
    boot: BootData;
    cmdline: CmdlineData;
    helpSearch: HelpSearchData;
    projects: CollectionEntry<"projects">[];
    personnelEntries: CollectionEntry<"personnel">[];
    commitsByRepo: Record<string, Commit[]>;
  }

  const {
    initialView,
    site,
    dashboard,
    notifications,
    tracker,
    profile,
    builds,
    personnel,
    companies,
    grep,
    help,
    boot,
    cmdline,
    helpSearch,
    projects,
    personnelEntries,
    commitsByRepo,
  }: Props = $props();

  /** PaneTree.svelte's own `bind:this` — its `getRef(paneId)` is the single
   * lookup every one of this file's delegation checks below now goes
   * through (PLAN.md "per-pane ref Map for delegation"), replacing the four
   * separate buildsRef/personnelRef/profileRef/helpRef variables this file
   * used to declare individually. Only ONE program is ever mounted at a
   * time this phase (the active window's one pane — no splits yet), so
   * `focusedRef()` below always resolves to whichever single component is
   * currently on screen. */
  let paneTreeRef = $state<{ getRef: (paneId: string) => unknown } | null>(null);

  /** Returns the currently-focused pane's ref (if it exposes one) — see
   * `paneTreeRef`'s own comment. Recomputed fresh on every call rather than
   * cached, exactly like the old per-view ref reads it replaces. */
  function focusedRef(): ProgramRef | undefined {
    return paneTreeRef?.getRef(activePane.id) as ProgramRef | undefined;
  }

  /** GrepOverlay.svelte (PLAN.md Phase 8) — always mounted (see that file's
   * header comment), consulted ahead of every other ref above EXCEPT the
   * active view's own vim Editor when one is open (PLAN.md Phase 3's
   * delegation flip, see handleKey() below): this is what makes "/" open
   * the overlay from inside Builds/Personnel when no editor is open, and
   * what keeps the overlay's own keys (typing, nav, Enter/Esc) from ever
   * reaching the view underneath while it's open. */
  let grepRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    close?: () => void;
    /** PLAN.md Phase 5C `:grep <query>` — see GrepOverlay.svelte's own
     * doc comments on these two exports. */
    isOpen?: () => boolean;
    openWithQuery?: (query: string) => void;
  } | null>(null);

  /** StatusBar's status-line prompt state machine (PLAN.md Phase 5 item
   * 5.1) — consulted in handleKey() below AFTER the prefix system (arm +
   * dispatch) has had a turn, so a prompt owns every key EXCEPT the ones
   * the prefix system itself claims (a bare Ctrl-b to arm, and the single
   * key immediately following an armed prefix, e.g. `]` to paste into the
   * prompt via its own registered paste target) — see handleKey()'s own
   * comment for why this ordering is load-bearing. */
  let statusBarRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    isPromptActive: () => boolean;
    showMessage: (text: string) => void;
    startRename: (initial: string, onCommit: (name: string) => void) => void;
    startConfirm: (text: string, onYes: () => void) => void;
    cancelPrompt: () => void;
  } | null>(null);

  /** Ctrl-b [ copy-mode overlay (PLAN.md Phase 5 item 5.3) — same
   * always-mounted / bind:this / handleKey():boolean contract as
   * GrepOverlay, consulted right after the status-bar prompt. */
  let copyModeRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    openOverlay: () => void;
    close: () => void;
  } | null>(null);

  /** BootSequence.svelte (PLAN.md Phase 5B) — always mounted, rendered
   * above every other overlay (see that component's own z-index note).
   * `isActive()` gates ALL key handling below (checked first, ahead of
   * even copy-mode); `replay()` is invoked by the dashboard's `r` hotkey
   * and the status-bar ↻ reboot control. */
  let bootRef = $state<{ replay: () => void; isActive: () => boolean } | null>(null);

  /** Cmdline.svelte (PLAN.md Phase 5C) — always mounted, same contract as
   * GrepOverlay/CopyMode above. `isOpen()` is consulted by the tmux prefix
   * system (handlePrefixedKey below) so an open box is gated exactly like
   * an open status-bar prompt (only the bare Ctrl-b arm and a prefixed `]`
   * paste get through); `handleKey()` is checked right alongside
   * `statusBarRef`'s own (same relative position — after the prefix system
   * has had its turn, before every view ref); `openSite`/`openEx`/
   * `openTmux` are called from the three different entry-context checks
   * further down. */
  let cmdlineRef = $state<{
    isOpen: () => boolean;
    openSite: () => void;
    openEx: () => void;
    openTmux: () => void;
    handleKey: (e: KeyboardEvent) => boolean;
    /** PLAN.md Iteration 3 Phase 3 item 3.2: window-chrome contract, same
     * shape as GrepOverlay/CopyMode's own `close()` — called from
     * `closeWindowChrome()` (and therefore every window switch/kill/reboot,
     * all of which call it) so an open box never survives a window switch,
     * a program launch, or a detach. */
    close: () => void;
  } | null>(null);

  /** HelpSearch.svelte (PLAN.md Iteration 3 Phase 3 item 3.3) — same
   * always-mounted / bind:this / handleKey():boolean / isOpen() / close()
   * contract as Cmdline above; `openPalette()` is called from the bare-`?`
   * opener further down (mirroring the bare-`:` opener that calls
   * cmdlineRef.openSite()). */
  let helpSearchRef = $state<{
    isOpen: () => boolean;
    openPalette: () => void;
    close: () => void;
    handleKey: (e: KeyboardEvent) => boolean;
  } | null>(null);

  /** Plays the mock's `bDashIn` entrance animation on the site chrome the
   * moment a real boot hands off to the ready dashboard (BootSequence's
   * `onReady` callback — never fires on the sessionStorage skip path,
   * since there's nothing to "hand off" from there). Cleared ~1.05s later
   * (the animation's own duration) so it doesn't linger as a stale inline
   * style or replay on an unrelated re-render. */
  let dashIn = $state(false);
  let dashInTimer: ReturnType<typeof setTimeout> | undefined;

  function onBootReady() {
    clearTimeout(dashInTimer);
    dashIn = true;
    dashInTimer = setTimeout(() => {
      dashIn = false;
    }, 1050);
  }

  // Deliberately an "uncontrolled" seed, not a tracked binding: each route
  // page SSRs Terminal exactly once with the view matching its own URL, and
  // every subsequent view change is client-side (setView/popstate below) —
  // `initialView` itself never changes again for the lifetime of this
  // island, so there is nothing to re-sync. (svelte-autofixer flags this
  // shape as `state_referenced_locally` on any `$state(prop)` seed; that is
  // the documented pattern for uncontrolled initial values and is
  // intentional here.)
  // svelte-ignore state_referenced_locally
  let client = $state<Client>(
    createFactoryClient({
      sessionId: DEFAULT_SESSION_ID,
      sessionName: DEFAULT_SESSION_NAME,
      windows: site.statusBar.windows,
      epoch: resolvePageEpoch(),
      activeWindowId: viewIdToProgram(initialView),
    }),
  );
  let offToast0 = $state(false);
  let offToast1 = $state(false);

  // Mobile-block JS guard (README "Mobile policy"): listeners/timers only
  // attach while the viewport is desktop-sized with a fine pointer. The
  // full mobile card UI lands in Phase 9 — this is only the guard
  // architecture, kept reactive to live resizes.
  let desktopMode = $state(false);

  // Set once the real keydown/popstate listeners are attached (below).
  // Under real (non-faked) timers, hydration + the mobile-guard effects
  // are asynchronous relative to the initial SSR paint, so e2e tests wait
  // on `[data-terminal-ready="true"]` before dispatching any key — the SSR
  // markup itself (e.g. the dashboard wordmark) is visible well before that and is
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

  // -----------------------------------------------------------------------
  // Derived read models over `client` (PLAN.md Iteration 3 Phase 4 item 4.1)
  // -----------------------------------------------------------------------

  /** Phase 4 always has exactly one, attached, session — the non-null
   * assertion is safe here (Phase 5's detach is what first makes this
   * legitimately undefined; every call site added this phase runs only
   * while attached). */
  const activeSession = $derived(activeSessionOf(client)!);
  const activeWindow = $derived(activeWindowOf(activeSession));
  const activePane = $derived(focusedPane(activeWindow));
  const activeProgram = $derived(activePane.program);

  /** "Which WINDOW (screen) is on-screen" — keyed off the window's own
   * stable id, NOT the program its pane currently runs (see this file's own
   * header comment on why those differ once Locked decision #5 applies).
   * Drives Wallpaper's opacity/blur knob and the dashboard-only hotkey gate
   * below, exactly like the old `view` var did before a pane could run
   * anything other than its window's own namesake program. */
  const view = $derived(windowIdToView(activeWindow.id));

  /** Status bar's own window list, re-derived from the live model on every
   * change — same shape (`{number, id, name}`) StatusBar.svelte has always
   * taken, just sourced from `client` instead of a separate `windows` $state
   * array. */
  const statusWindows = $derived(activeSession.windows.map((w) => ({ number: w.number, id: w.id, name: w.name })));

  /** Digit/`?` prefix targets, recomputed from the live window list so a
   * killed window's digit stops doing anything (tmux-faithful: an unbound
   * prefixed key is silently swallowed) — same shape as before Phase 4,
   * just holding window ids instead of ViewIds (the two agree for every one
   * of these five windows; see NUMBER_TO_ID below). */
  const NUMBER_TO_ID: Record<string, string> = {
    "1": "builds",
    "2": "personnel",
    "3": "retina-v",
    "4": "profile",
    "5": "help",
  };
  const prefixTargets = $derived.by((): Partial<Record<string, string>> => {
    const present = new Set(statusWindows.map((w) => w.id));
    const targets: Partial<Record<string, string>> = {};
    for (const [digit, id] of Object.entries(NUMBER_TO_ID)) {
      if (present.has(id)) targets[digit] = id;
    }
    if (present.has("help")) targets["?"] = "help";
    return targets;
  });

  // -----------------------------------------------------------------------
  // Window switching (PLAN.md Iteration 3 Phase 4 item 4.1 — replaces the
  // old single `setView(next: ViewId)`)
  // -----------------------------------------------------------------------

  /** Window-chrome contract (PLAN.md "close BEFORE the same-view early
   * return") — closes grep/cmdline/help-palette unconditionally. Called at
   * the top of every window-switch/kill/reboot path below, exactly like the
   * old `setView` did, so an open overlay never survives ANY of them, even
   * ones that end up no-op'ing (e.g. selecting the already-active window,
   * or a kill that gets refused). */
  function closeWindowChrome() {
    grepRef?.close?.();
    cmdlineRef?.close?.();
    helpSearchRef?.close?.();
  }

  /** pushState only when the ACTIVE PANE's program is canonical (not
   * "shell") AND the default session is attached (PLAN.md Architecture
   * notes) — a shelled-in pane freezes the URL wherever it already was.
   * Idempotent: a no-op when the route already matches (true for every
   * within-session switch that lands back on a window it started on, and
   * for popstate, which has already updated `location.pathname` itself). */
  function syncUrl() {
    if (client.attachedSessionId !== DEFAULT_SESSION_ID) return;
    const vid = programToViewId(activeProgram);
    if (!vid) return;
    if (location.pathname !== VIEW_ROUTES[vid]) {
      history.pushState(null, "", VIEW_ROUTES[vid]);
    }
  }

  /** Shared plumbing under every "switch the active window" entry point
   * (status-bar click, prefix digit/n/p/d/w/0, dashboard menu/hotkeys,
   * `select-window`, popstate) — closes chrome first (unconditionally, even
   * if `pickIndex` turns out to be a no-op), then applies the index
   * `pickIndex` computes from the CURRENT session, then syncs the URL.
   * `selectWindowIndex` itself already no-ops for an out-of-range or
   * already-active index, so this never needs its own guard for either. */
  function switchActiveWindow(pickIndex: (session: Session) => number) {
    closeWindowChrome();
    const session = activeSession;
    selectWindowIndex(session, pickIndex(session));
    syncUrl();
  }

  function switchToWindowById(id: string) {
    switchActiveWindow((session) => session.windows.findIndex((w) => w.id === id));
  }

  /** Every one of the six windows' own id equals its canonical program name
   * in this (the only, default) session — see tmux.ts's `FactorySeed`
   * comment — so "switch to the window that runs program X" is just
   * `switchToWindowById(program)`. Used by the dashboard menu/hotkeys,
   * Builds' "onTracker", Personnel's "onDashboard", GrepOverlay's Enter-
   * routing, and Cmdline/HelpSearch's `view:*` actions — every one of them
   * a WINDOW switch, never a program launch into the current pane. */
  function switchToProgram(program: ProgramName) {
    switchToWindowById(program);
  }

  function switchToView(v: ViewId) {
    switchToProgram(viewIdToProgram(v));
  }

  /** Ctrl-b n/p. */
  function cyclePrefixView(dir: 1 | -1) {
    switchActiveWindow((session) => {
      const len = session.windows.length;
      return len === 0 ? -1 : (session.activeWindowIdx + dir + len) % len;
    });
  }

  /** Status-bar ↻ reboot control (PLAN.md Phase 5B item 5B.3) — replays
   * boot from ANY window by first switching to the dashboard. Cancels a
   * stray status-bar prompt and a stray copy-mode overlay first (both
   * hazards the plan calls out explicitly: a rename/confirm prompt would
   * otherwise survive the switch bound to the old window, and copy-mode's
   * own z-index sits above the status bar so it would occlude the
   * freshly-replayed boot). `switchToProgram` already closes a stray grep/
   * cmdline/help-palette overlay.
   *
   * PLAN.md Phase 4 item 4.4 will extend this to also rebuild `client` to
   * factory state (new windows/panes/shell buffers) — this step only
   * preserves today's exact "go home + replay boot" behavior against the
   * new model. */
  function reboot() {
    statusBarRef?.cancelPrompt?.();
    copyModeRef?.close?.();
    cmdlineRef?.close?.();
    helpSearchRef?.close?.();
    switchToProgram("dashboard");
    bootRef?.replay();
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
  const PREFIX_TIMEOUT_MS = 2000;

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

  /** The active window's own display name, for the rename prompt's
   * prefilled text and the kill-window/kill-pane confirm templates'
   * `{name}` substitution. */
  function currentWindowName(): string {
    return activeWindow.name;
  }

  /** Ctrl-b & (and the Builds single-pane Ctrl-b x fallback, and a
   * kill-pane that emptied the last Builds panel) — PLAN.md Phase 5 item
   * 5.2, now backed by tmux.ts's own `killWindow` op (see its header
   * comment for the exact fallback-index formula, ported verbatim from what
   * used to live here). Refuses (a status message, no removal) when only
   * one window is left; closes window chrome and syncs the URL exactly like
   * every other window-switching path even though the fallback selection
   * happens as a side effect of the tmux.ts op itself rather than a second
   * explicit `switchActiveWindow` call. */
  function killWindowById(id: string) {
    closeWindowChrome();
    const result = killWindow(activeSession, id);
    if (!result.ok) {
      statusBarRef?.showMessage(site.statusBar.prompts.killLastWindowMessage);
      return;
    }
    syncUrl();
  }

  /** Ctrl-b , — PLAN.md Phase 5 item 5.2. Takes the target window's id as an
   * explicit argument (captured by `startRenamePrompt` at PROMPT-OPEN time)
   * rather than re-deriving it from `activeWindow` here at commit time —
   * defense in depth (verifier round 2) so this can never rename the wrong
   * window even if some future delegation change let the active window
   * drift while the prompt was still open; today's `handlePrefixedKey`
   * prompt-active gate already makes that drift impossible, but this
   * closure doesn't depend on that invariant holding elsewhere. */
  function renameWindowById(id: string, name: string) {
    renameWindowManual(activeSession, id, name);
  }

  function startRenamePrompt() {
    const id = activeWindow.id;
    statusBarRef?.startRename(currentWindowName(), (name) => renameWindowById(id, name));
  }

  function startKillWindowConfirm() {
    const id = activeWindow.id;
    const text = site.statusBar.prompts.killWindowTemplate.replace("{name}", currentWindowName());
    statusBarRef?.startConfirm(text, () => killWindowById(id));
  }

  /** The actual "kill the focused pane, or the window if it's the only
   * one" ACTION (as opposed to the interactive confirm-then-do flow below)
   * — factored out so PLAN.md Phase 5C's `Ctrl-b :` "kill-pane" tmux
   * command can call the exact same underlying behavior `Ctrl-b x`'s
   * confirm dialog eventually calls, without a second copy of the "which
   * pane, or fall back to kill-window" decision (PLAN.md 5C.1(c) "single
   * source of behavior; no duplicated kill/rename logic"). Keyed off the
   * focused ref's own `canKillPane` CAPABILITY rather than `view ===
   * "builds"` identity (PLAN.md Iteration 3 Phase 4 item 4.1 simplification
   * — only Builds' ref ever defines this method, so the outcome is
   * identical, but this no longer needs to know Builds exists by name). */
  function killPaneOrWindow() {
    const ref = focusedRef();
    if (ref?.canKillPane?.()) {
      ref.killFocusedPane?.();
    } else {
      killWindowById(activeWindow.id);
    }
  }

  /** Ctrl-b x — PLAN.md Phase 5 item 5.2: inside Builds with more than one
   * panel visible, confirms removing the FOCUSED panel only; everywhere
   * else (including Builds reduced to its last panel), "the only pane = the
   * window", so it's the exact same confirm/flow as Ctrl-b &.
   *
   * PLAN.md Phase 6 item 6.0 hardening: the target panel NUMBER (and its
   * title, for the prompt text) is captured HERE, at confirm-OPEN time —
   * same "id captured at prompt-open time" pattern as
   * startRenamePrompt/startKillWindowConfirm above. The committed closure
   * always kills that captured number via `ref.killPane(n)`, never
   * re-reading `ref.focusedPanelTitle()`/killFocusedPane() (which read
   * whatever is CURRENTLY focused) at confirm-execute time — so a mouse
   * click on a different panel's row while the "kill-pane <name>? (y/n)"
   * confirm is still open cannot redirect the kill to the newly-clicked
   * panel. */
  function startKillPaneConfirm() {
    const ref = focusedRef();
    if (ref?.canKillPane?.()) {
      const pane = ref.focusedPanelTitle?.() ?? "";
      const paneNumber = ref.focusedPanelNumber?.();
      const text = site.statusBar.prompts.killPaneTemplate.replace("{pane}", pane);
      statusBarRef?.startConfirm(text, () => {
        if (paneNumber !== undefined) ref.killPane?.(paneNumber);
      });
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

  // ---------------------------------------------------------------------
  // Site-wide floating Cmdline (PLAN.md Phase 5C) — Cmdline.svelte itself
  // is dumb about execution (see that component's own header comment);
  // every side effect a `:`/`Ctrl-b :` command implies lives here, reusing
  // the exact same functions the rest of this file already uses for the
  // equivalent bound key (switchToProgram, killWindowById, killPaneOrWindow,
  // renameWindowById, reboot, grepRef, downloadResume) — "single source of
  // behavior, no duplicated kill/rename logic" (PLAN.md 5C.1(c)).
  // ---------------------------------------------------------------------

  /** Forwards to the focused pane's own embedded Editor if it's actually
   * open (if any) — the ex-mode entry context (PLAN.md 5C.1(a)) always
   * tries this FIRST; only a command it doesn't recognize falls through to
   * the site-wide `commands` list below ("editor context wins"). Keyed off
   * the focused ref's own capability (same simplification as
   * killPaneOrWindow above) rather than `view === "builds"/"personnel"`
   * identity — only those two ever export `runEditorExCommand`. */
  function runEditorExCommand(cmd: string): { recognized: boolean; error?: string } {
    return focusedRef()?.runEditorExCommand?.(cmd) ?? { recognized: false };
  }

  function formatUnknownCommand(cmd: string): string {
    return cmdline.errors.unknownCommandTemplate.replace("{cmd}", cmd);
  }

  /** Executes a resolved `cmdline.yaml` `commands[]` entry by its `action`
   * id (PLAN.md 5C.2) — shared by both the "site" and "ex" entry contexts.
   * Returns an error string on failure, `undefined` on success (the box
   * closes itself whenever this returns nothing, same convention as the
   * `onSubmit` prop it's called from). */
  function executeSiteAction(action: string | undefined, args: string): string | undefined {
    switch (action) {
      case "view:home":
        switchToProgram("dashboard");
        return undefined;
      case "view:builds":
        switchToProgram("builds");
        return undefined;
      case "view:personnel":
        switchToProgram("personnel");
        return undefined;
      case "view:profile":
        switchToProgram("profile");
        return undefined;
      case "view:retina-v":
        switchToProgram("retina-v");
        return undefined;
      case "view:help":
        switchToProgram("help");
        return undefined;
      case "grep":
        grepRef?.openWithQuery?.(args);
        return undefined;
      case "reboot":
        reboot();
        return undefined;
      case "resume":
        downloadResume();
        return undefined;
      case "kill-window":
        // Last-window refusal surfaces as the usual status-bar message via
        // killWindowById() itself — never intercepted into the box (PLAN.md
        // 5C.2 "last-window refusal applies").
        killWindowById(activeWindow.id);
        return undefined;
      default:
        return undefined;
    }
  }

  /** Resolves `trimmed` against the site-wide `commands` list and runs it,
   * or reports E492 if nothing matches — the shared tail of both "site"
   * mode and ex mode's own fallback (PLAN.md 5C.2 "unknown -> the Phase-3
   * E492 template", reused verbatim for every context, not just an open
   * editor's — see cmdline.yaml's own `errors.unknownCommandTemplate`
   * comment). */
  function executeSiteOrUnknown(trimmed: string): string | undefined {
    const { name, args } = parseInput(trimmed);
    const def = resolveCommand(cmdline.commands, name);
    if (def) return executeSiteAction(def.action, args);
    return formatUnknownCommand(trimmed);
  }

  /** `Ctrl-b :` tmux command-prompt mode (PLAN.md 5C.1(c)) — parses and
   * dispatches `rename-window <name>` / `kill-window` / `kill-pane` /
   * `select-window <0-5>` through the exact functions the bound keys
   * (`,` / `&` / `x` / digit targets) already use, minus their interactive
   * confirm step: a typed command is already deliberate, exactly like
   * `:q` bypassing the bare-key q/Esc ban (PLAN.md items 15/16) — real
   * tmux's own command-prompt doesn't re-confirm `:kill-window` either
   * (only the `&` KEY binding is wrapped in `confirm-before`). */
  function executeTmuxCommand(trimmed: string): string | undefined {
    const parsed = parseTmuxCommand(trimmed);
    if (parsed.kind === "rename-window") {
      renameWindowById(activeWindow.id, parsed.name);
      return undefined;
    }
    if (parsed.kind === "kill-window") {
      killWindowById(activeWindow.id);
      return undefined;
    }
    if (parsed.kind === "kill-pane") {
      killPaneOrWindow();
      return undefined;
    }
    if (parsed.kind === "select-window") {
      if (parsed.index === 0) {
        switchToProgram("dashboard");
        return undefined;
      }
      const target = prefixTargets[String(parsed.index)];
      if (!target) return cmdline.errors.noSuchWindowTemplate.replace("{arg}", String(parsed.index));
      switchToWindowById(target);
      return undefined;
    }
    if (parsed.kind === "usage") {
      return parsed.command === "rename-window" ? cmdline.errors.usageRenameWindow : cmdline.errors.usageSelectWindow;
    }
    return formatUnknownCommand(trimmed);
  }

  /** Cmdline.svelte's `onSubmit` prop — the single entry point for every
   * `:`/`Ctrl-b :` command's actual side effect (see this section's own
   * header comment). */
  function onCmdlineSubmit(mode: CmdlineMode, raw: string): string | undefined {
    const trimmed = raw.trim();
    if (trimmed === "") return undefined;

    if (mode === "tmux") return executeTmuxCommand(trimmed);

    if (mode === "ex") {
      const result = runEditorExCommand(trimmed);
      if (result.recognized) return result.error;
      // Not a Phase-3 ex command — fall through to the site-wide set
      // (PLAN.md 5C.1(a) "PLUS the site-wide set below").
    }

    return executeSiteOrUnknown(trimmed);
  }

  /** HelpSearch.svelte's `onExecute` prop (PLAN.md Iteration 3 Phase 3 item
   * 3.3) — Enter on a command row there runs through the exact same
   * executeSiteAction switch every `:` command already does, with no typed
   * args (the palette's own typed text is a search query, never passed
   * through as a command argument). HelpSearch.svelte closes itself right
   * after calling this — this function only ever performs the action's own
   * side effect, same "dumb about presentation" split as onCmdlineSubmit. */
  function onHelpSearchExecute(action: string | undefined): void {
    executeSiteAction(action, "");
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

    // PLAN.md Phase 5 item 5.1 / verifier round 2 regression fix: while a
    // status-bar prompt (rename/confirm) is open, it OWNS the keyboard —
    // the only prefixed key allowed through is `]` (paste into the
    // prompt's own registered paste target). Every other prefixed command
    // (digit targets, n/p, d/w/0, ,/&/x/[, ?) is inert here: swallowed with
    // zero side effects, leaving the prompt bound to whatever window it was
    // opened for. Without this gate, `Ctrl-b <anything>` while a prompt was
    // open ran the FULL prefix system out from under it — switching the
    // view while a stale rename prompt for the OLD window stayed open (and
    // committed onto the NEW one), or silently replacing a rename prompt
    // with a kill-window confirm — exactly what an independent verifier
    // reproduced after the previous fix's reordering. This check must come
    // before every other branch below, `]` excepted.
    //
    // PLAN.md Phase 5C extends the exact same gate to an open Cmdline box:
    // "while it's open the prefix system should treat it like the status
    // prompts (only Ctrl-b arm + ] allowed through)" — this also means a
    // prompt already open blocks `Ctrl-b :` from opening the box at all
    // (checked below, after this combined gate), which is the "pick one
    // and test it" precedence PLAN.md 5C.1 calls for between the two modal
    // systems: prompts win over opening the box. PLAN.md Iteration 3 Phase
    // 3 item 3.3 extends the exact same gate a second time to the new `?`
    // HelpSearch palette — same modal, same treatment.
    if (statusBarRef?.isPromptActive() || cmdlineRef?.isOpen?.() || helpSearchRef?.isOpen?.()) {
      if (e.key === "]") {
        e.preventDefault();
        pasteFromBuffer();
        return true;
      }
      if (e.key.length === 1) e.preventDefault();
      return true;
    }

    const target = prefixTargets[e.key];
    if (target) {
      e.preventDefault();
      switchToWindowById(target);
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
      // PLAN.md Locked decision #3 / this task's mandatory sequencing:
      // Ctrl-b d/w keep their CURRENT "go home" behavior THIS PHASE — Phase
      // 5 rebinds d to detach and w to choose-tree.
      e.preventDefault();
      switchToProgram("dashboard");
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
    if (e.key === ":") {
      // Ctrl-b : — PLAN.md 5C.1(c), real tmux's own "command-prompt"
      // binding: opens the SAME floating box in its third mode
      // (tmuxCommands only — rename-window/kill-window/kill-pane/
      // select-window). The combined isPromptActive/cmdline-isOpen gate
      // above already stops this from firing while either modal system is
      // already up.
      e.preventDefault();
      cmdlineRef?.openTmux();
      return true;
    }

    // Unrecognized prefixed key — tmux swallows it silently (no action);
    // only preventDefault a printable character (mirrors GrepOverlay's own
    // "swallow printable, let modifiers through" split).
    if (e.key.length === 1) e.preventDefault();
    return true;
  }

  function handleKey(e: KeyboardEvent) {
    // PLAN.md Phase 5B: boot is unskippable — "there is no key or click
    // that jumps past it into the site" (BootSequence.svelte's own header
    // comment). Checked before EVERYTHING else, including copy-mode, which
    // can't legitimately be open yet at this point anyway but is skipped
    // unconditionally here for the same reason the mock's own boot
    // componentDidMount only ever wires up its own `r`-on-ready check and
    // nothing else while booting.
    if (bootRef?.isActive?.()) return;

    // Item 5.3's copy-mode overlay is always-mounted / consulted-early,
    // same as GrepOverlay's own contract — checked before the prefix system
    // below, same relative position it has always had.
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
    //
    // Gated behind `!isPromptActive()` (verifier round 2): dispatching a
    // literal Ctrl-b down the view chain while a status-bar prompt is open
    // could still reach e.g. an open editor's own Ctrl-b page-back sitting
    // behind the prompt — a side effect the prompt-owns-the-keyboard
    // invariant forbids just as much as a view switch. When a prompt is
    // active this falls into the `else` branch instead, which
    // `handlePrefixedKey`'s own prompt-active gate (above) already makes
    // fully inert (it disarms, returns false since Ctrl-b carries
    // `ctrlKey: true`, and the plain re-arm check below re-arms with no
    // other observable effect).
    let sendPrefixLiteral = false;
    if (prefixArmed) {
      if (
        !statusBarRef?.isPromptActive() &&
        !cmdlineRef?.isOpen?.() &&
        !helpSearchRef?.isOpen?.() &&
        e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.toLowerCase() === "b"
      ) {
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

    // PLAN.md Phase 5 item 5.1: a status-line prompt (rename/confirm) OWNS
    // the keyboard once it's open — but ONLY AFTER the prefix system above
    // has had its turn. This is "prefix precedence" extended to prompts
    // (mirroring the Phase 1 "prefix precedence over grep" rule this file
    // already applies to GrepOverlay): a prompt-open Ctrl-b must still be
    // able to ARM (the two checks above), and the very next prefixed key
    // (e.g. `]`, which pasteFromBuffer() below routes into the prompt's own
    // registered paste target) must still be able to DISPATCH — neither of
    // which could ever happen if this check ran first and swallowed both
    // keydowns before the prefix system ever saw them (the bug an
    // independent verifier caught: `Ctrl-b ]` silently typed a literal `]`
    // into the rename box instead of pasting, because the old top-of-
    // function placement here consumed the Ctrl-b that was supposed to arm
    // it). Every OTHER key — plain typing, Enter, Backspace, Escape — never
    // matches the prefix system above (it only reacts to an armed prefix or
    // a bare Ctrl-b) and so still reaches the prompt exactly as before.
    // PLAN.md Phase 5C item 5C.4: the Cmdline box, once open, is "checked
    // at the top alongside boot/copy-mode/status prompts" — same relative
    // position as `statusBarRef.handleKey` immediately below (after the
    // prefix system has had its turn, for the same "Ctrl-b ] must still
    // reach it" reason spelled out in that check's own comment), and
    // mutually exclusive with it in practice: opening the box requires no
    // prompt to be active (see the fallback opener further down), and
    // opening a prompt while the box is open is impossible today (nothing
    // currently starts a rename/kill confirm from inside an open Cmdline).
    if (cmdlineRef?.handleKey(e)) return;

    // PLAN.md Iteration 3 Phase 3 item 3.3: the `?` HelpSearch palette gets
    // the exact same relative slot as Cmdline immediately above it (right
    // after the prefix system, right before the status-bar prompt) — same
    // "Ctrl-b ] must still reach it" reasoning, and mutually exclusive with
    // Cmdline in practice (the combined isPromptActive/isOpen gate further
    // up already stops either one from opening while the other is up).
    if (helpSearchRef?.handleKey(e)) return;

    if (statusBarRef?.handleKey(e)) return;

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

    /** Tries the FOCUSED pane's own ref (PLAN.md "editor gate consults the
     * FOCUSED pane only" — replaces the old per-view buildsRef/personnelRef/
     * profileRef/helpRef branches with one generic lookup through
     * PaneTree's ref registry), subject to the same "no bare modifier
     * combos except the editor scroll chord" gate every ref has always
     * used. Whether the widened (scroll-chord-permitting) gate applies is
     * now a CAPABILITY check (does this ref export `isEditorOpen` at all?)
     * rather than an identity check (`view === "builds"/"personnel"`) —
     * only Builds/Personnel ever do, so the outcome is identical to before
     * this file's Phase 4 refactor. Returns whether the key was consumed. */
    function tryFocusedRef(): boolean {
      const ref = focusedRef();
      if (!ref?.handleKey) return false;
      const supportsScrollChord = typeof ref.isEditorOpen === "function";
      const modifierOk = (supportsScrollChord && isEditorScrollChord) || !(e.metaKey || e.ctrlKey || e.altKey);
      if (!modifierOk) return false;
      if (ref.handleKey(e)) {
        e.preventDefault();
        return true;
      }
      return false;
    }

    // PLAN.md Phase 3 "delegation flip": while the focused pane's vim
    // Editor is open, it must get first refusal ahead of GrepOverlay so `/`
    // searches the open buffer instead of opening grep — vim-faithful.
    // Everywhere else (no editor open), the original order holds: grep is
    // consulted first, exactly mirroring the prototype's own dispatch order
    // (Homepage.dc.html line 980: `if (this.state.grep) { this.grepKey(e);
    // return; }` runs before any view-specific handling), except that the
    // tmux prefix (above) now runs ahead of it per the retired "prefix
    // inert while grep open" rule.
    const editorIsOpen = !!focusedRef()?.isEditorOpen?.();

    if (editorIsOpen && tryFocusedRef()) {
      return;
    }

    // GrepOverlay.svelte owns "/" (open) and every key while it's already
    // open. GrepOverlay.handleKey() calls e.preventDefault() itself exactly
    // where the prototype's grepKey() does (see that file's header
    // comment) — never here — so an unrecognized modifier combo held while
    // the overlay is open (e.g. Cmd+L) still reaches the browser, it just
    // never reaches the focused pane's ref or the view-switch keys below.
    if (grepRef?.handleKey(e)) {
      return;
    }

    // Covers Builds/Personnel's non-editor handling (e.g. Builds' j/k repo
    // navigation) AND Profile's `r`/HelpView's j/k (which used to be two
    // separate unconditional blocks here — both refs simply never export
    // `isEditorOpen`, so `editorIsOpen` is already false for them and this
    // one call reaches them in exactly the same relative position).
    if (!editorIsOpen && tryFocusedRef()) {
      return;
    }

    // PLAN.md Phase 5C item 5C.1(b) fallback opener: a bare `:` that
    // NOTHING above already consumed opens the site-wide Cmdline box.
    // Placed here — after every text-input-owning consumer above has had
    // its turn (grep's own query, an open editor's `/` search, Personnel's
    // filter mode, the status-bar rename prompt) — for free: each of those
    // already swallows every key (including `:`) while it's active, so
    // this line is simply never reached while any of them own the
    // keyboard, which is exactly "`:` stays literal inside grep query/
    // personnel filter/rename prompt" (5C.1(b)) with no extra state probes
    // needed. `editorIsOpen` (computed above) picks context (a) vs (b):
    // ex mode when a file editor is open (even though it no longer
    // intercepts `:` itself — see Editor.svelte's own comment on that),
    // site mode everywhere else. Shift+":" (US-layout Shift+;) must still
    // open the box, so only meta/ctrl/alt are excluded here.
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === ":") {
      e.preventDefault();
      if (editorIsOpen) cmdlineRef?.openEx();
      else cmdlineRef?.openSite();
      return;
    }

    // PLAN.md Iteration 3 Phase 3 item 3.3 / Locked decision #14: a bare
    // `?` that NOTHING above already consumed opens the `?` HelpSearch
    // palette — mirrors the `:` fallback opener immediately above in every
    // way (same reasoning for why grep/cmdline/a status prompt/copy-mode/
    // boot are all already guaranteed inactive by the time control reaches
    // here — each of those consumes `?` itself while active, exactly like
    // `:`), EXCEPT one: unlike `:` (which still opens Cmdline in "ex" mode
    // while a file editor is open), `?` must NOT open anything while an
    // editor is open (Locked #14 "editor open (any mode)" is a full
    // exclusion, not a mode switch) — Editor.svelte's own handleKey already
    // returns `false` for an unrecognized `?` (it's neither a vim motion
    // nor a mutating key), so without this explicit `!editorIsOpen` guard
    // the palette would incorrectly pop up over an open buffer. Shift+"/"
    // (US-layout Shift+/) must still open the palette, so only meta/ctrl/
    // alt are excluded here, same as `:`.
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === "?" && !editorIsOpen) {
      e.preventDefault();
      helpSearchRef?.openPalette();
      return;
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

    // PLAN.md Phase 5B item 5B.3: `r` on the ready dashboard replays boot
    // (mock's own `componentDidMount`'s `phase === "ready"` guard — by
    // construction here `view === "home"` already implies boot isn't
    // active, since the top-of-function gate above returns early while it
    // is). No conflict with Profile's own `r` (resume download): that's a
    // different window, handled by its own ref further up this function.
    if (k === "r") {
      bootRef?.replay();
      return;
    }

    const target = hotkeyToView(k);
    if (target) switchToProgram(viewIdToProgram(target));
  }

  /** PLAN.md Risks note "popstate bypasses the switch pipeline today; route
   * it through selectWindow in Phase 4" — unlike the pre-Phase-4 version
   * (which just reassigned `view` directly, skipping window-chrome
   * close-on-switch entirely), this now goes through the exact same
   * `switchToWindowById` every other window-switch path uses: closes grep/
   * cmdline/help-palette, then selects the DEFAULT session's window whose id
   * matches the popped route (a browser back/forward always lands on one of
   * the six canonical routes, never a mid-shell state) — "maps route ->
   * session 0 window if present, else no-op" (Architecture notes); no-op is
   * automatic here since `switchToWindowById` already no-ops for a missing
   * id. `syncUrl()` inside it never re-pushes: the browser has already
   * updated `location.pathname` to match by the time this fires. */
  function onPopState() {
    switchToWindowById(viewIdToProgram(pathToView(location.pathname)));
  }
</script>

<div
  data-terminal-ready={keysReady}
  style="position:relative;min-height:100vh;overflow:hidden;background:#0b0f14;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;color:#c9d1d9;animation:{dashIn
    ? 'bDashIn 1.05s cubic-bezier(.2,.7,.3,1) both'
    : 'none'}"
>
  <Wallpaper {tracker} {view} />

  <div style="position:relative;z-index:2;height:100vh;overflow:hidden;display:flex;flex-direction:column">
    <Toasts
      toasts={dashboard.toasts}
      {notifications}
      {view}
      {offToast0}
      {offToast1}
      onHideToast0={() => (offToast0 = true)}
      onHideToast1={() => (offToast1 = true)}
    />

    <PaneTree
      bind:this={paneTreeRef}
      node={activeWindow.root}
      {dashboard}
      {builds}
      {personnel}
      {profile}
      {help}
      {companies}
      {projects}
      {personnelEntries}
      {commitsByRepo}
      onWindowSwitch={switchToProgram}
    />

    <StatusBar
      bind:this={statusBarRef}
      {site}
      windows={statusWindows}
      activeWindowId={activeWindow.id}
      onSelect={switchToWindowById}
      onReboot={reboot}
    />
  </div>

  <GrepOverlay bind:this={grepRef} {grep} onNavigate={switchToView} />
  <CopyMode bind:this={copyModeRef} copyMode={site.copyMode} />
  <BootSequence bind:this={bootRef} {boot} {desktopMode} onReady={onBootReady} />
  <Cmdline bind:this={cmdlineRef} {cmdline} onSubmit={onCmdlineSubmit} />
  <HelpSearch bind:this={helpSearchRef} {helpSearch} {cmdline} {help} onExecute={onHelpSearchExecute} />
</div>
