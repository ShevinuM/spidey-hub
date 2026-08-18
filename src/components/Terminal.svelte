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
  import { tick } from "svelte";
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
    ShellData,
    ChooseTreeData,
  } from "../lib/data";
  import type { Commit } from "../lib/commits";
  import type { ViewId } from "../lib/views";
  import { VIEW_ROUTES, hotkeyToView, pathToView, programToViewId, viewIdToProgram, windowIdToView } from "../lib/views";
  import type { Client, ProgramName, Session, Window, LayoutName, PaneDirection } from "../lib/tmux";
  import {
    activeSessionOf,
    activeWindowOf,
    allPanes,
    applyLayout,
    attachSession,
    createFactoryClient,
    createSession,
    createWindow,
    cycleNextPane,
    detachClient,
    exitProgram,
    focusDirectional,
    focusedPane,
    focusLastPane,
    isLayoutName,
    killPaneInWindow,
    killSession,
    killWindowCascade,
    launchProgram,
    nextLayout,
    paneIndexInWindow,
    reapplyLastLayout,
    renameWindowManual,
    selectWindowIndex,
    splitPane,
    windowOfPane,
  } from "../lib/tmux";
  import type { SessionRosterEntry, ShellLineKind, ShellMode } from "../lib/shell";
  import { seedHostNarrative } from "../lib/shell";
  import { resolvePageEpoch } from "../lib/clock";
  import { getPasteBuffer } from "../lib/pasteBuffer";
  import { getActivePasteTarget } from "../lib/pasteTargets";
  import { parseInput, parseTmuxCommand, resolveCommand } from "../lib/cmdline";
  import { downloadResume } from "../lib/resume";
  import Wallpaper from "./Wallpaper.svelte";
  import StatusBar from "./StatusBar.svelte";
  import PaneTree from "./PaneTree.svelte";
  import Shell from "./Shell.svelte";
  import Toasts from "./Toasts.svelte";
  import GrepOverlay from "./GrepOverlay.svelte";
  import CopyMode from "./CopyMode.svelte";
  import ChooseTree from "./ChooseTree.svelte";
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
   * ref at all, Profile/HelpView only ever export `handleKey`.
   *
   * PLAN.md Iteration 3 Phase 6 item 6.3: the Builds-internal panel-kill
   * fields this interface used to carry (`canKillPane`/`focusedPanelTitle`/
   * `focusedPanelNumber`/`killFocusedPane`/`killPane`) are REMOVED entirely —
   * `Ctrl-b x` now always kills the real tmux PANE (src/lib/tmux.ts), never
   * a Builds-internal panel, per Locked decision #4. */
  interface ProgramRef {
    handleKey?: (e: KeyboardEvent) => boolean;
    isEditorOpen?: () => boolean;
    runEditorExCommand?: (cmd: string) => { recognized: boolean; error?: string };
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
    shell: ShellData;
    chooseTree: ChooseTreeData;
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
    shell,
    chooseTree,
    projects,
    personnelEntries,
    commitsByRepo,
  }: Props = $props();

  /** PLAN.md Iteration 3 Phase 4 item 4.2 — the six canonical, launchable
   * program names (every `ProgramName` except "shell") — Shell.svelte's own
   * bare-command/`open <view>` validation, and the palette this file's
   * `viewIdToProgram`/`programToViewId` bridge already agrees with. */
  const VIEW_NAMES = ["dashboard", "builds", "personnel", "retina-v", "profile", "help"] as const;

  /** Every in-pane Shell instance is "pane" mode; the one host-shell
   * instance rendered directly below (not through PaneTree) is "host" mode —
   * see the template's `{#if activeSession}...{:else}...{/if}` split. */
  const SHELL_MODE: ShellMode = "pane";

  /** Shared, non-reactive pane-ref registry (PLAN.md Iteration 3 Phase 6
   * item 6.1, advisor-caught) — created ONCE here and threaded down through
   * every recursive `<PaneTree>`/`<svelte:self>` instance as a plain prop
   * (never `$state`; consulted imperatively on keydown, never rendered
   * through a template — same non-reactive convention PaneTree.svelte's own
   * per-leaf registration effect already used). Phase 4's original design
   * had PaneTree.svelte own a fresh `Map` PER COMPONENT INSTANCE with a
   * `getRef(paneId)` export Terminal called on the ROOT instance only —
   * that broke the moment splitting existed at all: the root becomes a
   * split node, every leaf lives in a CHILD instance with its OWN map, and
   * `getRef` on the root would only ever see whichever leaf happens to
   * render at the root (never true post-split) — every other pane's ref
   * silently vanished from delegation. One shared map threaded down as a
   * prop sidesteps that entirely: every leaf, at any depth, registers into
   * the exact same object. */
  const paneRefs = new Map<string, unknown>();

  /** The one HOST-mode Shell instance (PLAN.md Iteration 3 Phase 5 item
   * 5.1) — rendered directly in the template below (never through
   * PaneTree, since there's no window/pane tree to render while detached).
   * `handleKey` is the only member `activeRef()` below ever needs from it. */
  let hostShellRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** Returns the currently-focused pane's ref (if it exposes one) — see
   * `paneRefs`'s own comment. Recomputed fresh on every call rather than
   * cached, exactly like the old per-view ref reads it replaces. `undefined`
   * while detached (no pane is focused then) — see `activeRef()` below for
   * the delegation target that actually covers that case. */
  function focusedRef(): ProgramRef | undefined {
    if (!activePane) return undefined;
    return paneRefs.get(activePane.id) as ProgramRef | undefined;
  }

  /** PLAN.md Iteration 3 Phase 5 item 5.1 — "keyboard belongs to the host
   * shell" while detached: the SAME delegation slot `focusedRef()` has
   * always occupied (key-consumption checks below, `paneIsGreedy`'s own
   * `tryFocusedRef()`), just routed to the host shell instance instead of
   * whatever pane happens to be focused. Kill-pane/rename/ex-command call
   * sites deliberately keep calling `focusedRef()` directly, never this —
   * those operations are meaningless in host mode and are unreachable while
   * detached anyway (the tmux prefix is inert then). */
  function activeRef(): ProgramRef | undefined {
    return activeSession ? focusedRef() : (hostShellRef as ProgramRef | undefined);
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

  /** ChooseTree.svelte (PLAN.md Iteration 3 Phase 6 item 6.5, `Ctrl-b w`) —
   * same always-mounted / bind:this / handleKey():boolean / isOpen()/close()
   * contract as Cmdline/HelpSearch above. `openOverlay()` is called from
   * the prefix `w` binding (REBOUND from "go home", Locked decision #3);
   * `handleKey()` is consulted in its own documented slot (see ChooseTree.
   * svelte's own header comment) — after copy-mode and the prefix system,
   * before Cmdline/StatusBar/every view ref. */
  let chooseTreeRef = $state<{
    isOpen: () => boolean;
    openOverlay: () => void;
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
      hostNarrative: seedHostNarrative(shell, DEFAULT_SESSION_NAME),
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

  /** `undefined` once detached (PLAN.md Iteration 3 Phase 5 item 5.1) — no
   * session owns the keyboard, the host shell does instead (see
   * `Client.attachedSessionId`'s own comment). Every function below that
   * assumes this is defined is only ever reachable from a UI path that
   * itself only exists while attached (PaneTree/StatusBar aren't even
   * mounted while detached, and the tmux prefix is inert then too — see
   * `armPrefix()`'s own gate) — EXCEPT `switchActiveWindow` (popstate can
   * fire regardless of attachment), which guards explicitly. */
  const activeSession = $derived(activeSessionOf(client));
  const activeWindow = $derived(activeSession ? activeWindowOf(activeSession) : undefined);
  const activePane = $derived(activeWindow ? focusedPane(activeWindow) : undefined);
  const activeProgram = $derived(activePane?.program);

  /** PLAN.md Iteration 3 Phase 6 item 6.1 — whether the active window has
   * more than one pane right now; gates PaneTree's active-pane border
   * accent (a single-pane window shows no border, matching real tmux — see
   * PaneTree.svelte's own header comment). */
  const multiPane = $derived(activeWindow ? allPanes(activeWindow.root).length > 1 : false);

  /** StatusBar's real tmux `-` flag (PLAN.md Iteration 3 Phase 4 item 4.3
   * tmux fidelity reference) — the session's previously-active window.
   * Undefined on a fresh session (activeWindowIdx === lastWindowIdx) or
   * while detached, same as real tmux showing no `-` until a switch has
   * actually happened. */
  const lastWindowId = $derived.by(() => {
    const s = activeSession;
    if (!s || s.lastWindowIdx === s.activeWindowIdx) return undefined;
    return s.windows[s.lastWindowIdx]?.id;
  });

  /** "Which WINDOW (screen) is on-screen" — keyed off the window's own
   * stable id, NOT the program its pane currently runs (see this file's own
   * header comment on why those differ once Locked decision #5 applies).
   * Drives Wallpaper's opacity/blur knob and the dashboard-only hotkey gate
   * below, exactly like the old `view` var did before a pane could run
   * anything other than its window's own namesake program. `undefined`
   * while detached — there is no "on-screen window" then. */
  const view = $derived(activeWindow ? windowIdToView(activeWindow.id) : undefined);

  /** Status bar's own window list, re-derived from the live model on every
   * change — same shape (`{number, id, name}`) StatusBar.svelte has always
   * taken, just sourced from `client` instead of a separate `windows` $state
   * array. Empty while detached (StatusBar isn't even mounted then — see
   * the template). */
  const statusWindows = $derived(activeSession ? activeSession.windows.map((w) => ({ number: w.number, id: w.id, name: w.name })) : []);

  /** Shell.svelte's own `session` prop (PLAN.md Iteration 3 Phase 4 item
   * 4.2's `tmux ls`) — every IN-PANE shell's anchor session (its own).
   * Falls back to a harmless zero-value shape while detached (unreachable
   * in practice — no pane is mounted then — kept only so this derived never
   * throws). */
  const shellSession = $derived.by(() => {
    const s = activeSession;
    if (!s) return { name: "", windowCount: 0, createdAt: resolvePageEpoch(), attached: false };
    return { name: s.name, windowCount: s.windows.length, createdAt: s.createdAt, attached: client.attachedSessionId === s.id };
  });

  /** PLAN.md Iteration 3 Phase 5 items 5.2/5.3 — every session the client
   * currently knows about, in the exact shape src/lib/shell.ts's
   * `RunContext.sessions` wants — computed fresh on every keystroke/render
   * so `tmux ls`/`new`/`a`/`attach`'s validation always sees the live
   * roster. Threaded to BOTH pane-mode Shell instances (via PaneTree) and
   * the host-mode one below — `tmux ls` works everywhere. */
  const sessionsRoster = $derived(
    client.sessions.map(
      (s): SessionRosterEntry => ({
        id: s.id,
        name: s.name,
        windowCount: s.windows.length,
        createdAt: s.createdAt,
        attached: client.attachedSessionId === s.id,
        lastAttachedSeq: s.lastAttachedSeq,
        windowIds: s.windows.map((w) => w.id),
      }),
    ),
  );

  /** The detached HOST shell's own `session` prop (neofetch's uptime
   * anchor only — see shell.ts's `RunContext.session` doc comment). Not
   * "the attached session" (there isn't one while detached) — just a
   * stable reference point so neofetch has SOME `createdAt` to compute
   * against; falls back to the page's own load epoch if every session has
   * been destroyed (PLAN.md Iteration 3 Phase 5 item 5.3's `[exited]`
   * end-state, advisor-caught: `client.sessions` can be legitimately
   * empty there). */
  const hostSessionSummary = $derived.by(() => {
    const s = client.sessions[0];
    return s
      ? { name: s.name, windowCount: s.windows.length, createdAt: s.createdAt, attached: false }
      : { name: "", windowCount: 0, createdAt: resolvePageEpoch(), attached: false };
  });

  /** Digit/`?` prefix targets, recomputed from the live window list so a
   * killed window's digit stops doing anything (tmux-faithful: an unbound
   * prefixed key is silently swallowed) — same shape as before Phase 4,
   * just holding window ids instead of ViewIds. Fully generic over each
   * window's own `number` field (PLAN.md Iteration 4 item 16, `Ctrl-b c`)
   * rather than a hardcoded 1-5 map — behavior-identical for the six fixed
   * seed windows (every one of them has `number === its own fixed digit`,
   * present-gated either way) AND the only way a window `createWindow()`
   * appends later (numbered 6+, see that function's own comment) gets a
   * digit slot of its own for free, without this needing to know that any
   * such window exists. `0`'s own dedicated handling (both the plain
   * `e.key === "0"` branch below and `executeTmuxCommand`'s `select-window
   * 0` special case) is untouched by this — dashboard's window always has
   * `number === 0` too, so including it here would just be a redundant,
   * behavior-identical second path to the exact same result. Empty while
   * detached — the prefix is inert then anyway (`armPrefix()`'s own gate),
   * so this is never consulted, but must still not throw. */
  const prefixTargets = $derived.by((): Partial<Record<string, string>> => {
    const targets: Partial<Record<string, string>> = {};
    for (const w of statusWindows) {
      if (w.number >= 1 && w.number <= 9) targets[String(w.number)] = w.id;
    }
    if (statusWindows.some((w) => w.id === "help")) targets["?"] = "help";
    return targets;
  });

  // -----------------------------------------------------------------------
  // Window switching (PLAN.md Iteration 3 Phase 4 item 4.1 — replaces the
  // old single `setView(next: ViewId)`)
  // -----------------------------------------------------------------------

  /** Window-chrome contract (PLAN.md "close BEFORE the same-view early
   * return") — closes grep/cmdline/help-palette/choose-tree unconditionally.
   * Called at the top of every window-switch/kill/reboot path below,
   * exactly like the old `setView` did, so an open overlay never survives
   * ANY of them, even ones that end up no-op'ing (e.g. selecting the
   * already-active window, or a kill that gets refused). PLAN.md Iteration 3
   * Phase 6 item 6.5: choose-tree's own Enter-switch already calls its own
   * `close()` directly, but every OTHER window-switch entry point (status-
   * bar click, prefix digit/n/p, dashboard hotkeys, `Ctrl-b d` detach) goes
   * through this helper — closing it here too means choose-tree never
   * survives any of THOSE either. */
  function closeWindowChrome() {
    grepRef?.close?.();
    cmdlineRef?.close?.();
    helpSearchRef?.close?.();
    chooseTreeRef?.close?.();
  }

  /** pushState only when the ACTIVE PANE's program is canonical (not
   * "shell") AND the default session is attached (PLAN.md Architecture
   * notes) — a shelled-in pane freezes the URL wherever it already was.
   * Idempotent: a no-op when the route already matches (true for every
   * within-session switch that lands back on a window it started on, and
   * for popstate, which has already updated `location.pathname` itself). */
  function syncUrl() {
    if (client.attachedSessionId !== DEFAULT_SESSION_ID) return;
    // `attachedSessionId === DEFAULT_SESSION_ID` already implies
    // `activeSession`/`activeProgram` are defined (only true while
    // attached) — the assertion is safe by construction, not a guess.
    const vid = programToViewId(activeProgram!);
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
    // Detached (advisor-caught): popstate is the one caller reachable
    // regardless of attachment (a browser back/forward can fire after
    // `Ctrl-b d`) — every OTHER caller (status-bar click, prefix nav,
    // dashboard hotkeys) only exists while attached. No session to switch
    // within, so this is a no-op — "maps route -> session 0 window if
    // present, else no-op" already covers "no session at all" the same way.
    if (!session) return;
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
   * PLAN.md Locked decision #6 / Phase 4 item 4.4: "reboot (all triggers) =
   * factory state + boot replay" — REPLACES `client` wholesale with a fresh
   * `createFactoryClient()` call (the exact same shape the initial `$state`
   * seed above uses) rather than merely switching the EXISTING client back
   * to the dashboard window (this function's interim Phase 4.1-4.3 form) —
   * every window/pane/program/shell buffer resets, not just the active
   * one. Toast dismissals (`offToast0`/`offToast1`) are the other half of
   * "factory state" this phase's Locked decision covers (in-memory, no
   * persistence) and reset alongside it. `grepRef` is closed explicitly
   * here (unlike every other window-switch entry point, which gets it for
   * free from `switchActiveWindow`'s own `closeWindowChrome()` — reboot no
   * longer routes through that helper now that it rebuilds `client`
   * directly instead of switching the old one). */
  function reboot() {
    statusBarRef?.cancelPrompt?.();
    copyModeRef?.close?.();
    cmdlineRef?.close?.();
    helpSearchRef?.close?.();
    chooseTreeRef?.close?.();
    grepRef?.close?.();
    client = createFactoryClient({
      sessionId: DEFAULT_SESSION_ID,
      sessionName: DEFAULT_SESSION_NAME,
      windows: site.statusBar.windows,
      epoch: resolvePageEpoch(),
      activeWindowId: "dashboard",
      hostNarrative: seedHostNarrative(shell, DEFAULT_SESSION_NAME),
    });
    offToast0 = false;
    offToast1 = false;
    syncUrl();
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
   * `{name}` substitution. Only ever called while attached — the rename/
   * kill-window prompts it feeds are only reachable via the tmux prefix
   * (inert while detached, see `armPrefix()`'s own gate) or a PaneTree/
   * StatusBar interaction (neither is even mounted while detached). */
  function currentWindowName(): string {
    return activeWindow!.name;
  }

  /** Appends one system line (a `[detached (from session …)]`, `[exited]`,
   * or `logout`) directly to the HOST shell's own persistent buffer
   * (`Client.hostPane` — PLAN.md Iteration 3 Phase 5 item 5.1's "own
   * persistent buffer, survives re-attach/detach cycles"). These are never
   * typed commands, so they never go through shell.ts's own `runCommand` —
   * this is the one place Terminal.svelte writes into a shell buffer
   * directly. */
  function appendHostLine(text: string, kind: ShellLineKind = "output") {
    client.hostPane.shell = { ...client.hostPane.shell, lines: [...client.hostPane.shell.lines, { text, kind }] };
  }

  /** Ctrl-b & (and the Builds single-pane Ctrl-b x fallback, a kill-pane
   * that emptied the last Builds panel, and shell `exit` in the last pane)
   * — PLAN.md Iteration 3 Phase 5 item 5.3, now routed through tmux.ts's
   * `killWindowCascade` instead of the bare `killWindow` op: killing a
   * window that ISN'T the session's last one still just removes it
   * (unchanged Phase 4 behavior); killing the LAST window now destroys the
   * session outright — this SUPERSEDES Phase 4's "refuse to kill the only
   * window" (dead now that sessions exist to fall back to; see
   * `killWindowCascade`'s own header comment). If that cascade leaves NO
   * session attached, the client has detached to the host shell — append
   * the exact `[exited]` line there. If another session was silently
   * switched to instead, nothing further happens here (PLAN.md: "show
   * nothing special"). */
  function killWindowById(id: string) {
    closeWindowChrome();
    const session = activeSession!;
    const result = killWindowCascade(client, session, id);
    if (result.kind === "session-destroyed" && result.detachedToHost) {
      appendHostLine(shell.host.exitedMessage);
    }
    syncUrl();
  }

  /** Shell.svelte's `onLaunch` (PLAN.md Iteration 3 Phase 4 item 4.2) — a
   * bare view-name command or `open <view>` typed into a pane's shell:
   * launches `program` IN THAT PANE (tmux.ts's own `launchProgram`), never
   * a window switch — Locked decision #5's "any pane can launch any
   * program". `program` arrives pre-validated by shell.ts's own
   * `runCommand` (checked against `VIEW_NAMES`), so the cast is safe. Syncs
   * the URL only when the launch happened in the currently ACTIVE pane
   * (always true this phase — every window has exactly one pane, and only
   * the active window's pane is ever mounted — kept as an explicit guard so
   * Phase 6 splits don't silently start pushing the wrong route for a
   * launch in a non-focused pane). Closes grep/cmdline/palette first,
   * unconditionally — same window-chrome contract every other
   * switch/launch/kill entry point follows (`switchActiveWindow`,
   * `exitActiveProgram`, `killWindowById`): a launch changes what's on
   * screen just as much as a window switch does, so any open chrome from
   * the PREVIOUS pane content must not survive it. Latent this phase
   * (every window has exactly one pane, always the focused one, so this
   * is reachable from the same context those other paths already are) —
   * becomes reachable from a NON-focused pane once Phase 6 adds splits. */
  function onLaunchInPane(paneId: string, program: string) {
    closeWindowChrome();
    launchProgram(activeSession!, paneId, program as ProgramName);
    if (paneId === activePane?.id) syncUrl();
  }

  /** Shell.svelte's `onExit` — the `exit` builtin (PLAN.md Architecture
   * notes: "pane shell: closes pane → cascades like kill-pane"). PLAN.md
   * Iteration 3 Phase 6: now that a window can have more than one pane,
   * this resolves `paneId`'s OWN owning window (via `windowOfPane`, never
   * assumed to be `activeWindow` — advisor-caught: `onExit` only ever fires
   * from the FOCUSED pane in practice, but the window it lives in is found
   * from the id, not hardcoded) and either removes just that pane (more than
   * one pane in the window — `killPaneInWindow`) or falls back to the exact
   * same window-kill cascade `Ctrl-b x`'s single-pane case uses. */
  function onExitPane(paneId: string) {
    const session = activeSession!;
    const win = windowOfPane(session, paneId);
    if (!win) return; // defensive — unreachable: onExit always fires from a live pane in THIS session
    if (allPanes(win.root).length > 1) {
      closeWindowChrome();
      killPaneInWindow(win, paneId);
      syncUrl();
    } else {
      killWindowById(win.id);
    }
  }

  /** Site-mode `:q` / cmdline `q` (PLAN.md Locked decision #2, item 4.3) —
   * drops the ACTIVE PANE's program back to a shell in the SAME window
   * (tmux.ts's `exitProgram`); never kills the window. Distinct from
   * `onExitPane` above (Shell.svelte's own `exit` builtin, typed inside an
   * ALREADY-shell pane, which has no program left to drop and so still
   * cascades to kill-window — Phase 4.2's unchanged behavior). Closes
   * chrome first (same convention as every other window-affecting action)
   * and re-syncs the URL, which freezes in place: `programToViewId("shell")`
   * is null, so `syncUrl()` no-ops, satisfying Verify 4's "URL unchanged
   * while in shell" probe. */
  function exitActiveProgram() {
    closeWindowChrome();
    exitProgram(activeSession!, activePane!.id);
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
    renameWindowManual(activeSession!, id, name);
  }

  function startRenamePrompt() {
    const id = activeWindow!.id;
    statusBarRef?.startRename(currentWindowName(), (name) => renameWindowById(id, name));
  }

  function startKillWindowConfirm() {
    const id = activeWindow!.id;
    const text = site.statusBar.prompts.killWindowTemplate.replace("{name}", currentWindowName());
    statusBarRef?.startConfirm(text, () => killWindowById(id));
  }

  /** `Ctrl-b d` (PLAN.md Locked decision #3 / Iteration 3 Phase 5 item 5.1)
   * — REPLACES the Phase 4 "go home" behavior. Only reachable while
   * attached (the tmux prefix never arms otherwise — see `armPrefix()`'s
   * own gate), so the non-null assertion is safe by construction. Detaches
   * the client, then appends the exact `[detached (from session {name})]`
   * line to the host shell's own persistent buffer — the SAME string its
   * own pre-seeded narrative already used once, now for a real, live
   * detach. */
  function detachSession() {
    closeWindowChrome();
    const session = activeSession!;
    detachClient(client);
    appendHostLine(shell.host.detachedTemplate.replace("{name}", session.name));
  }

  // -----------------------------------------------------------------------
  // Host shell effects (PLAN.md Iteration 3 Phase 5 item 5.2) — Shell.svelte's
  // `onAttach`/`onCreateAndAttach`/`onAttachView`, only ever invoked from the
  // ONE host-mode Shell instance (rendered directly in the template below,
  // never through PaneTree) — a pane-mode instance's own `runCommand` never
  // emits these effects (shell.ts gates every one of them behind `mode ===
  // "host"`).
  // -----------------------------------------------------------------------

  /** `tmux a [-t name]` resolved to an existing session id by shell.ts. */
  function onHostAttach(sessionId: string) {
    attachSession(client, sessionId);
    syncUrl();
  }

  /** `tmux new [-s name]` — `name` already resolved/validated (non-
   * duplicate, or the next free numeric name) by shell.ts. Real tmux's own
   * "starting a new session from outside both creates and attaches". */
  function onHostCreateAndAttach(name: string) {
    const session = createSession(client, name, resolvePageEpoch());
    attachSession(client, session.id);
    syncUrl();
  }

  /** `open <view>` / `edith` in HOST mode (PLAN.md Architecture notes) —
   * attaches the default session and selects `view`'s window if it still
   * exists; otherwise attaches anyway (staying on whatever window that
   * session is already on) and surfaces a transient status-bar message —
   * the "attach + message per your judgment" allowance PLAN.md leaves to
   * the executor for a window that's since been killed. */
  async function onHostAttachView(sessionId: string, view: string, windowExists: boolean) {
    const session = client.sessions.find((s) => s.id === sessionId);
    if (!session) return; // defensive — shell.ts already checked this session exists
    attachSession(client, sessionId);
    if (windowExists) {
      const idx = session.windows.findIndex((w) => w.id === view);
      if (idx !== -1) selectWindowIndex(session, idx);
    } else {
      // `statusBarRef` is still null here — StatusBar was UNMOUNTED (we were
      // detached) and Svelte hasn't re-rendered the `{#if activeSession}`
      // branch yet within this same synchronous tick, so `bind:this` hasn't
      // fired. `tick()` flushes that pending render before the message is
      // shown, so it actually lands on the StatusBar that just mounted
      // rather than silently no-op'ing through the `?.` (advisor-caught).
      await tick();
      statusBarRef?.showMessage(shell.host.windowGoneTemplate.replace("{view}", view).replace("{name}", session.name));
    }
    syncUrl();
  }

  /** Host `exit` builtin (PLAN.md Iteration 3 Phase 5 item 5.3) — prints
   * `logout` then reloads the page; the boot-seen sessionStorage flag is
   * untouched by a reload, so boot skips exactly like any other reload
   * (BootSequence.svelte's own gate), landing back on the factory-attached
   * default session. */
  function onHostExit() {
    appendHostLine(shell.host.logoutMessage);
    window.location.reload();
  }

  /** The actual "kill the focused PANE, or the window if it's the only one"
   * ACTION (PLAN.md Iteration 3 Phase 6 item 6.3 / Locked decision #4 — a
   * REAL tmux pane kill now, not a Builds-internal panel one) — factored out
   * so the NO-CONFIRM `Ctrl-b :` "kill-pane" tmux command can call the exact
   * same underlying behavior `Ctrl-b x`'s own confirm dialog below
   * eventually calls, without a second copy of the "which pane, or fall
   * back to kill-window" decision (PLAN.md "single source of behavior; no
   * duplicated kill/rename logic"). */
  function killPaneOrWindow() {
    const win = activeWindow!;
    const paneId = activePane!.id;
    if (allPanes(win.root).length > 1) {
      closeWindowChrome();
      killPaneInWindow(win, paneId);
      syncUrl();
    } else {
      killWindowById(win.id);
    }
  }

  /** Ctrl-b x (PLAN.md Iteration 3 Phase 6 item 6.3 / Locked decision #4) —
   * REAL kill-pane: ALWAYS prompts `kill-pane {pane_index}? (y/n)`, even on
   * a single-pane window — REPLACES the iteration-2 Builds-internal
   * panel-kill behavior (canKillPane/focusedPanelNumber/killPane, now
   * deleted from Builds.svelte entirely) with the real tmux semantic:
   * destroying the last pane destroys the window by cascade, no separate
   * "fall back to kill-window confirm" step. The target pane's id and its
   * `pane_index` (for the prompt text — `Window.paneOrder`'s own live-
   * renumbered position) are captured HERE, at confirm-OPEN time — same
   * "captured at prompt-open time" pattern as startRenamePrompt/
   * startKillWindowConfirm above, so a later focus change while the confirm
   * is still open can't redirect which pane actually dies. */
  function startKillPaneConfirm() {
    const win = activeWindow!;
    const paneId = activePane!.id;
    const index = paneIndexInWindow(win, paneId);
    const text = site.statusBar.prompts.killPaneTemplate.replace("{pane}", String(index));
    statusBarRef?.startConfirm(text, () => {
      if (allPanes(win.root).length > 1) {
        closeWindowChrome();
        killPaneInWindow(win, paneId);
        syncUrl();
      } else {
        killWindowById(win.id);
      }
    });
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
  // Splits / pane nav / layouts (PLAN.md Iteration 3 Phase 6 items 6.1/6.2/
  // 6.4) — every one of these operates on the ACTIVE window's own tree;
  // none of them touch the URL (a split/nav/layout change never implies a
  // different WINDOW, hence never a different route — `syncUrl()` isn't
  // called from any of these, matching the "URL keyed off the active
  // WINDOW's program, not its pane arrangement" rule the rest of this file
  // already follows).
  // ---------------------------------------------------------------------

  /** `Ctrl-b |`/`%` (direction "row") and `Ctrl-b -`/`"` (direction
   * "column") — splits the active window's focused pane 50/50 with a new
   * shell pane, which becomes focused. */
  function splitFocusedPane(direction: "row" | "column") {
    splitPane(activeWindow!, direction);
  }

  /** Prefix `o` — next pane, cycling `paneOrder`. */
  function cycleFocusedPane() {
    cycleNextPane(activeWindow!);
  }

  /** Prefix `;` — jump back to whichever pane was focused immediately
   * before the current one (toggles back and forth on repeated presses). */
  function jumpToLastPane() {
    focusLastPane(activeWindow!);
  }

  /** Prefix arrow keys — geometric directional pane nav. */
  function navigateDirectional(dir: PaneDirection) {
    focusDirectional(activeWindow!, dir);
  }

  /** `Ctrl-b Space` — next preset in the fidelity-verified cycle. */
  function cycleLayout() {
    nextLayout(activeWindow!);
  }

  /** `select-layout <name>` / bare `select-layout` (PLAN.md 6.4, `Ctrl-b :`
   * tmux command-prompt mode) — applies the named preset, or reapplies
   * whatever was last applied when no name is given (a silent no-op if none
   * ever was). Unknown names are reported by the caller
   * (`executeTmuxCommand` below), which already has the raw typed string. */
  function applyNamedLayout(name: LayoutName | undefined) {
    const win = activeWindow!;
    if (name) applyLayout(win, name);
    else reapplyLastLayout(win);
  }

  /** `Ctrl-b c` (PLAN.md Iteration 4 item 16) — tmux new-window: creates a
   * new window running the in-window shell program and switches focus to it
   * immediately (real tmux's own combined "create and select" behavior for
   * this binding — distinct from `createSession`'s create-only split, which
   * a SEPARATE `attachSession()` call finishes; here `selectWindowIndex` is
   * that second call, run right after `createWindow` appends it). Closes
   * window chrome first, same convention every other window-affecting
   * action follows (`switchActiveWindow`, `killWindowById`, `detachSession`)
   * — including choose-tree, which is not otherwise gated for this key
   * (PLAN.md 6.5: same free-close treatment as the digit/n/p window-switch
   * keys, nothing to starve). `syncUrl()` no-ops for the newly-shelled
   * window exactly like `:q`'s `exitActiveProgram` does (`programToViewId
   * ("shell")` is null) — the URL freezes wherever it already was. */
  function createWindowInSession() {
    closeWindowChrome();
    const session = activeSession;
    if (!session) return;
    createWindow(session);
    selectWindowIndex(session, session.windows.length - 1);
    syncUrl();
  }

  // ---------------------------------------------------------------------
  // choose-tree (PLAN.md Iteration 3 Phase 6 item 6.5, `Ctrl-b w`) —
  // ChooseTree.svelte's own callback props; every one of these is a WINDOW/
  // SESSION-level change, so each funnels through the same helpers every
  // other switch/kill path in this file already uses (switchToWindowById,
  // killWindowCascade, killSession) rather than duplicating that logic here.
  // ---------------------------------------------------------------------

  /** Enter on a WINDOW row — attaches its session first if it isn't already
   * the attached one (real tmux: choosing a window in a different session
   * switches the client to it), then selects that window. */
  function chooseTreeSelectWindow(sessionId: string, windowId: string) {
    if (client.attachedSessionId !== sessionId) attachSession(client, sessionId);
    const session = client.sessions.find((s) => s.id === sessionId);
    if (!session) return; // defensive — the row this came from only exists for a live session
    const idx = session.windows.findIndex((w) => w.id === windowId);
    if (idx !== -1) selectWindowIndex(session, idx);
    syncUrl();
  }

  /** Enter on a SESSION row — attaches it, staying on whichever window it
   * already had active (real tmux: no window change implied). */
  function chooseTreeSelectSession(sessionId: string) {
    attachSession(client, sessionId);
    syncUrl();
  }

  /** In-overlay `x` → case-insensitive `y` on a WINDOW row — reuses the
   * exact same cascade `Ctrl-b &`/`Ctrl-b x`'s single-pane fallback already
   * runs (window→session→`[exited]`), since a window dying is a window
   * dying regardless of which UI asked for it. */
  function chooseTreeKillWindow(sessionId: string, windowId: string) {
    const session = client.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const result = killWindowCascade(client, session, windowId);
    if (result.kind === "session-destroyed" && result.detachedToHost) {
      appendHostLine(shell.host.exitedMessage);
      // Nothing left to browse — the client is now fully detached, so
      // there's no PaneTree/StatusBar left underneath this overlay either
      // (Terminal's own `{#if activeSession}...{:else}...{/if}` branch has
      // already switched to the host shell). Close it rather than leaving
      // an empty tree floating over the host shell.
      chooseTreeRef?.close?.();
    }
    syncUrl();
  }

  /** In-overlay `x` → case-insensitive `y` on a SESSION row (PLAN.md
   * Locked decision #16: only the TYPED `kill-session` command is out of
   * scope, not this overlay action) — kills every window in that session at
   * once via tmux.ts's own `killSession`. */
  function chooseTreeKillSession(sessionId: string) {
    const result = killSession(client, sessionId);
    if (result.detachedToHost) {
      appendHostLine(shell.host.exitedMessage);
      chooseTreeRef?.close?.(); // see chooseTreeKillWindow's own comment
    }
    syncUrl();
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
      case "exit-program":
        // Locked decision #2 (site-mode `:q` / cmdline `q`): exits the
        // active pane's program to a shell — never kills the window, no
        // last-window guard to apply (see exitActiveProgram()'s own doc).
        exitActiveProgram();
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
      renameWindowById(activeWindow!.id, parsed.name);
      return undefined;
    }
    if (parsed.kind === "kill-window") {
      killWindowById(activeWindow!.id);
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
    if (parsed.kind === "select-layout") {
      applyNamedLayout(parsed.name);
      return undefined;
    }
    if (parsed.kind === "select-layout-unknown") {
      return cmdline.errors.unknownLayoutTemplate.replace("{name}", parsed.name);
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

    // PLAN.md Iteration 3 Phase 6 item 6.5 (documented keyboard-slot choice,
    // advisor-reviewed) — while choose-tree is open, it owns the keyboard
    // for its OWN vocabulary via a LATER delegation slot (ChooseTree.svelte's
    // own `handleKey`, consulted after this whole function returns). Four
    // PREFIXED keys are gated OFF here specifically, though: `,`/`&`/`x`
    // (status-bar rename/kill prompts) and `:` (the Cmdline box) would each
    // pop a competing modal UNDERNEATH the overlay — since this component's
    // handleKey runs BEFORE StatusBar's/Cmdline's in the dispatch chain, that
    // prompt's own y/n/Enter keystrokes could never reach it, leaving it
    // permanently starved (advisor-caught). Window-switch keys (digits, n/p)
    // and detach (`d`) are deliberately NOT gated — both close the overlay
    // for free (`closeWindowChrome()`/`detachSession()` already do), so
    // there's nothing to starve.
    const chooseTreeOpen = !!chooseTreeRef?.isOpen?.();
    if (chooseTreeOpen && (e.key === "," || e.key === "&" || pk === "x" || e.key === ":")) {
      if (e.key.length === 1) e.preventDefault();
      return true;
    }

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
    if (e.key === "0") {
      e.preventDefault();
      switchToProgram("dashboard");
      return true;
    }
    if (pk === "c") {
      // PLAN.md Iteration 4 item 16 — `c` is tmux new-window: creates a
      // fresh window running the in-window shell program and switches to it
      // immediately (see `createWindowInSession`'s own comment).
      e.preventDefault();
      createWindowInSession();
      return true;
    }
    if (pk === "w") {
      // PLAN.md Locked decision #3 / Iteration 3 Phase 6 item 6.5 — `w` is
      // now real tmux choose-tree, REPLACING the Phase 4/5 "go home"
      // behavior (`0` still always selects window 0, unaffected). Closes
      // grep/cmdline/palette first (window-chrome contract) — reachable in
      // practice only for grep (Cmdline/HelpSearch being open already
      // blocks every prefixed key including this one, per the combined gate
      // above), same "prefix precedence over grep" PLAN.md Phase 1 rule
      // every other window-switch prefix key already follows.
      e.preventDefault();
      closeWindowChrome();
      chooseTreeRef?.openOverlay();
      return true;
    }
    if (pk === "d") {
      // PLAN.md Locked decision #3 / Iteration 3 Phase 5 item 5.1 — `d` is
      // now real tmux detach, REPLACING the Phase 4 "go home" behavior.
      e.preventDefault();
      detachSession();
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
      // select-window/select-layout). The combined isPromptActive/
      // cmdline-isOpen gate above already stops this from firing while
      // either modal system is already up.
      e.preventDefault();
      cmdlineRef?.openTmux();
      return true;
    }

    // PLAN.md Iteration 3 Phase 6 item 6.1 — `|`/`%` split RIGHT (row),
    // `-`/`"` split BELOW (column).
    if (e.key === "|" || e.key === "%") {
      e.preventDefault();
      splitFocusedPane("row");
      return true;
    }
    if (e.key === "-" || e.key === '"') {
      e.preventDefault();
      splitFocusedPane("column");
      return true;
    }
    // Item 6.2 — prefix `o` next-pane, `;` last-pane, arrow keys directional.
    if (pk === "o") {
      e.preventDefault();
      cycleFocusedPane();
      return true;
    }
    if (e.key === ";") {
      e.preventDefault();
      jumpToLastPane();
      return true;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir: PaneDirection =
        e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : e.key === "ArrowLeft" ? "left" : "right";
      navigateDirectional(dir);
      return true;
    }
    // Item 6.4 — prefix Space cycles the 7 preset layouts.
    if (e.key === " ") {
      e.preventDefault();
      cycleLayout();
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
    //
    // PLAN.md Iteration 3 Phase 5 item 5.1: "while detached, the Ctrl-b
    // prefix is INERT — no prefix arming" — `activeSession` gates the arm
    // itself (not e.g. a check inside `handlePrefixedKey`, which would only
    // stop DISPATCH, not arming): with no arm, `prefixArmed` simply never
    // becomes true while detached, so a bare Ctrl-b just falls through
    // untouched (no preventDefault either) like any other unrecognized
    // chord — the keydown reaches the host shell's own handler next, which
    // already refuses every ctrlKey-held combo (Shell.svelte's own
    // `handleKey` guard), so it's a true no-op, not merely "swallowed".
    if (!sendPrefixLiteral && activeSession && e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      armPrefix();
      return;
    }

    // PLAN.md Iteration 3 Phase 6 item 6.5 (documented keyboard-slot choice)
    // — choose-tree's own handleKey slot: right after copy-mode AND after
    // the tmux prefix system has had its FULL turn (both dispatch of an
    // armed prefix above, AND arming a bare Ctrl-b immediately above this),
    // but before Cmdline/StatusBar/every view ref. Placing this AFTER the
    // arm-check (not merely after the dispatch block) is load-bearing: a
    // bare Ctrl-b keydown carries `ctrlKey: true`, which ChooseTree's own
    // `handleKey` swallows unconditionally (it owns the keyboard while
    // open) — if this check ran any earlier, a bare Ctrl-b could never even
    // ARM while choose-tree is open, making `Ctrl-b d` (detach, which must
    // still work per PLAN.md 6.5) unreachable. With the slot here, the arm
    // above already returned by the time a plain Ctrl-b would reach this
    // line, and the FOLLOWING prefixed key still dispatches through
    // `handlePrefixedKey` first (same "if (prefixArmed)" block above) before
    // ever reaching choose-tree — so `Ctrl-b d` detaches (closing the
    // overlay via `detachSession()`'s own `closeWindowChrome()` call) and
    // `Ctrl-b <digit>/n/p` switch windows (same free close), exactly as
    // ChooseTree.svelte's own header comment describes. Every UNPREFIXED
    // key (bare j/k/h/l/Enter/x/q/Esc — this component's own vocabulary)
    // reaches it here since the prefix system above is a no-op for those.
    if (chooseTreeRef?.handleKey(e)) return;

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
      const ref = activeRef();
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
    const editorIsOpen = !!activeRef()?.isEditorOpen?.();

    // PLAN.md Iteration 3 Phase 4 Architecture notes: "focused-shell panes
    // consume printable keys/Enter/Backspace/arrows BEFORE grep's `/`
    // opener" — a shell pane gets the exact same first-refusal treatment an
    // open vim editor already does (both are "this pane owns its own text
    // input right now"), so `/`/`:`/`?` all type into the shell instead of
    // opening grep/Cmdline/HelpSearch. `editorIsOpen` itself stays scoped to
    // "an embedded vim Editor is open" for the ex-mode/`?`-exclusion checks
    // further down — a shell pane is never in "ex mode", it just never
    // reaches those checks at all (Shell.svelte's handleKey claims every
    // printable character first).
    //
    // PLAN.md Iteration 3 Phase 5 item 5.1: "keyboard belongs to the host
    // shell" while detached — `!activeSession` extends the exact same
    // greedy treatment to the host shell instance, which `activeRef()`
    // above already resolves to in that case. This is also what makes the
    // tmux prefix's own inertness complete: with the prefix never arming
    // (see `armPrefix()`'s gate) AND every other key claimed here by the
    // host shell, nothing below this line — grep/Cmdline/HelpSearch's own
    // fallback openers, the dashboard hotkeys — is ever reachable while
    // detached.
    const paneIsGreedy = editorIsOpen || activeProgram === "shell" || !activeSession;

    if (paneIsGreedy && tryFocusedRef()) {
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
    if (!paneIsGreedy && tryFocusedRef()) {
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
  <Wallpaper {tracker} view={view ?? "home"} dim={!activeSession} isRetinaFocused={activeProgram === "retina-v"} />

  <div style="position:relative;z-index:2;height:100vh;overflow:hidden;display:flex;flex-direction:column">
    {#if activeSession}
      <!-- Attached (PLAN.md Iteration 3 Phase 5 item 5.1) — the non-null
           assertions below are safe: this whole branch only renders while
           `activeSession` (hence `activeWindow`) is defined. -->
      <Toasts
        toasts={dashboard.toasts}
        {notifications}
        view={view!}
        {offToast0}
        {offToast1}
        onHideToast0={() => (offToast0 = true)}
        onHideToast1={() => (offToast1 = true)}
      />

      <PaneTree
        node={activeWindow!.root}
        activePaneId={activeWindow!.activePaneId}
        {multiPane}
        refs={paneRefs}
        {dashboard}
        {builds}
        {personnel}
        {profile}
        {help}
        {shell}
        {companies}
        {projects}
        {personnelEntries}
        {commitsByRepo}
        onWindowSwitch={switchToProgram}
        {onLaunchInPane}
        {onExitPane}
        onReboot={reboot}
        shellMode={SHELL_MODE}
        viewNames={VIEW_NAMES}
        {shellSession}
        sessions={sessionsRoster}
        defaultSessionName={DEFAULT_SESSION_NAME}
      />

      <StatusBar
        bind:this={statusBarRef}
        {site}
        sessionName={activeSession.name}
        windows={statusWindows}
        activeWindowId={activeWindow!.id}
        {lastWindowId}
        onSelect={switchToWindowById}
        onReboot={reboot}
      />
    {:else}
      <!-- Detached (PLAN.md Iteration 3 Phase 5 item 5.1) — the host shell,
           fullscreen over the dim radar: no Toasts (dashboard-only), no
           PaneTree/StatusBar (no session owns the screen). -->
      <Shell
        bind:this={hostShellRef}
        {shell}
        pane={client.hostPane}
        mode="host"
        viewNames={VIEW_NAMES}
        session={hostSessionSummary}
        sessions={sessionsRoster}
        defaultSessionName={DEFAULT_SESSION_NAME}
        onLaunch={() => {}}
        onExit={onHostExit}
        onReboot={reboot}
        onAttach={onHostAttach}
        onCreateAndAttach={onHostCreateAndAttach}
        onAttachView={onHostAttachView}
      />
    {/if}
  </div>

  <GrepOverlay bind:this={grepRef} {grep} onNavigate={switchToView} />
  <CopyMode bind:this={copyModeRef} copyMode={site.copyMode} />
  <BootSequence bind:this={bootRef} {boot} {desktopMode} onReady={onBootReady} />
  <Cmdline bind:this={cmdlineRef} {cmdline} onSubmit={onCmdlineSubmit} />
  <HelpSearch bind:this={helpSearchRef} {helpSearch} {cmdline} {help} {shell} onExecute={onHelpSearchExecute} />
  <ChooseTree
    bind:this={chooseTreeRef}
    {client}
    {chooseTree}
    onSelectWindow={chooseTreeSelectWindow}
    onSelectSession={chooseTreeSelectSession}
    onKillWindow={chooseTreeKillWindow}
    onKillSession={chooseTreeKillSession}
  />
</div>
