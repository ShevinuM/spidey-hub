<script lang="ts">
  // Single Svelte island mounted by every route page: owns the tmux
  // client/session/window/pane model (src/common/engines/tmux/tmux.ts), the global keymap,
  // and pushState/popstate URL sync. Astro SSRs this island with
  // `initialView` so the first paint matches the route with no client-side
  // flash; all window switches after that are client-side only.
  //
  // One `client: Client` $state object (src/common/engines/tmux/tmux.ts) drives everything
  // — sessions own windows, windows own a pane tree, panes own a running
  // program — rendered through <PaneTree>. `view`/`activeWindowId` below
  // are DERIVED read models over that client, kept only because
  // Wallpaper's opacity/blur knob and the dashboard-only hotkey gate are
  // keyed off "which WINDOW (screen) is on-screen", a concept distinct from
  // "which PROGRAM its pane happens to be running" since a pane can run any
  // program (or a shell) in any window.
  //
  // The `client` model, every derived read model over it, and every
  // window/pane/session/cmdline action live in `./terminalState.svelte.ts`
  // (`TerminalState`, constructed as `core` below) — extracted during the
  // folder+core-class relocation refactor. This file keeps: every
  // `bind:this` ref to an always-mounted overlay/status component, the
  // single global keydown/popstate listener registration, and the keydown
  // dispatch order/view delegation logic itself (`handleKey`/
  // `handlePrefixedKey`/`onPopState`) — see terminalState.svelte.ts's own
  // header comment for why the split falls there.
  import type { CollectionEntry } from "astro:content";
  import type {
    SiteData,
    DashboardData,
    NotificationsData,
    TrackerData,
    ProfileData,
    RepositoriesData,
    PersonnelData,
    GrepData,
    HelpData,
    BootData,
    CmdlineData,
    HelpSearchData,
    ShellData,
    ChooseTreeData,
  } from "../common/lib/data";
  import type { Commit } from "../lib/commits";
  import type { ViewId } from "../common/lib/views";
  import { pathToView, viewIdToProgram } from "../common/lib/views";
  import type { PaneDirection } from "../common/engines/tmux/tmux";
  import type { ShellMode } from "../lib/shell";
  import { TerminalState, DEFAULT_SESSION_NAME } from "./terminalState.svelte";
  import Wallpaper from "../common/components/Wallpaper.svelte";
  import StatusBar from "../common/components/StatusBar.svelte";
  import PaneTree from "../common/components/PaneTree.svelte";
  import Shell from "../components/Shell.svelte";
  import Notifications from "../components/notifications/Notifications.svelte";
  import GrepOverlay from "../components/grep-overlay/GrepOverlay.svelte";
  import CopyMode from "../common/components/CopyMode.svelte";
  import ChooseTree from "../common/components/ChooseTree.svelte";
  import BootSequence from "../components/BootSequence.svelte";
  import Cmdline from "../common/components/Cmdline.svelte";
  import HelpSearch from "../features/help/components/HelpSearch.svelte";

  /** Unified optional-methods contract every mounted program component's
   * `bind:this` ref may expose, since PaneTree.svelte's single ref registry
   * looks all of them up through one shape. Every field stays optional:
   * Dashboard/retina-v export no ref at all, Profile only ever exports
   * `handleKey`; HelpView also exports `isEditorOpen` (its own filter box
   * needs the same "owns the keyboard while focused" treatment an open vim
   * Editor already gets).
   *
   * `Ctrl-b x` always kills the real tmux PANE (src/common/engines/tmux/tmux.ts), never a
   * Repositories-internal panel. */
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
    /** Server-computed `process.env.PORTFOLIO_FIXTURES === "1"` (read in the
     * page's Astro frontmatter, never client-side — see Notifications.svelte's
     * own header comment for why). Gates the notification system into a
     * fixed, hand-authored core with no localStorage, no per-visit
     * injection, and no toasts, for deterministic golden capture. */
    notificationsFixtureMode: boolean;
    tracker: TrackerData;
    profile: ProfileData;
    repositories: RepositoriesData;
    personnel: PersonnelData;
    grep: GrepData;
    help: HelpData;
    boot: BootData;
    cmdline: CmdlineData;
    helpSearch: HelpSearchData;
    shell: ShellData;
    chooseTree: ChooseTreeData;
    projects: CollectionEntry<"repositories">[];
    personnelEntries: CollectionEntry<"personnel">[];
    commitsByRepo: Record<string, Commit[]>;
  }

  const {
    initialView,
    site,
    dashboard,
    notifications,
    notificationsFixtureMode,
    tracker,
    profile,
    repositories,
    personnel,
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

  /** The six canonical, launchable program names (every `ProgramName`
   * except "shell") — Shell.svelte's own
   * bare-command/`open <view>` validation, and the palette this file's
   * `viewIdToProgram`/`programToViewId` bridge already agrees with. */
  const VIEW_NAMES = ["dashboard", "repositories", "employment", "retina-v", "profile", "help"] as const;

  /** Every in-pane Shell instance is "pane" mode; the one host-shell
   * instance rendered directly below (not through PaneTree) is "host" mode —
   * see the template's `{#if activeSession}...{:else}...{/if}` split. */
  const SHELL_MODE: ShellMode = "pane";

  /** Shared, non-reactive pane-ref registry — created ONCE here and
   * threaded down through every recursive `<PaneTree>`/`<svelte:self>`
   * instance as a plain prop (never `$state`; consulted imperatively on
   * keydown, never rendered through a template — same non-reactive
   * convention PaneTree.svelte's own per-leaf registration effect already
   * uses). A PER-COMPONENT-INSTANCE map with a `getRef(paneId)` export
   * called only on the ROOT instance would break once a window has split
   * panes: the root becomes a split node, every leaf lives in a CHILD
   * instance with its OWN map, and `getRef` on the root would only ever see
   * whichever leaf happens to render at the root — every other pane's ref
   * would silently vanish from delegation. One shared map threaded down as
   * a prop sidesteps that entirely: every leaf, at any depth, registers
   * into the exact same object. */
  const paneRefs = new Map<string, unknown>();

  /** The one HOST-mode Shell instance — rendered directly in the template
   * below (never through PaneTree, since there's no window/pane tree to
   * render while detached). `handleKey` is the only member `activeRef()`
   * below ever needs from it. */
  let hostShellRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** Returns the currently-focused pane's ref (if it exposes one) — see
   * `paneRefs`'s own comment. Recomputed fresh on every call rather than
   * cached. `undefined` while detached (no pane is focused then) — see
   * `activeRef()` below for the delegation target that actually covers
   * that case. */
  function focusedRef(): ProgramRef | undefined {
    if (!core.activePane) return undefined;
    return paneRefs.get(core.activePane.id) as ProgramRef | undefined;
  }

  /** "Keyboard belongs to the host shell" while detached: the SAME
   * delegation slot `focusedRef()` has always occupied (key-consumption
   * checks below, `paneIsGreedy`'s own
   * `tryFocusedRef()`), just routed to the host shell instance instead of
   * whatever pane happens to be focused. Kill-pane/rename/ex-command call
   * sites deliberately keep calling `focusedRef()` directly, never this —
   * those operations are meaningless in host mode and are unreachable while
   * detached anyway (the tmux prefix is inert then too). */
  function activeRef(): ProgramRef | undefined {
    return core.activeSession ? focusedRef() : (hostShellRef as ProgramRef | undefined);
  }

  /** GrepOverlay.svelte — always mounted (see that file's header comment),
   * consulted ahead of every other ref above EXCEPT the active view's own
   * vim Editor when one is open (the delegation flip, see handleKey()
   * below): this is what makes "/" open the overlay from inside
   * Repositories/Personnel when no editor is open, and what keeps the overlay's
   * own keys (typing, nav, Enter/Esc) from ever reaching the view
   * underneath while it's open. */
  let grepRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    close?: () => void;
    /** `:grep <query>` — see GrepOverlay.svelte's own doc comments on
     * these two exports. */
    isOpen?: () => boolean;
    openWithQuery?: (query: string) => void;
  } | null>(null);

  /** StatusBar's status-line prompt core machine — consulted in
   * handleKey() below AFTER the prefix system (arm +
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

  /** Ctrl-b [ copy-mode overlay — same always-mounted / bind:this /
   * handleKey():boolean contract as GrepOverlay, consulted right after the
   * status-bar prompt. */
  let copyModeRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    openOverlay: () => void;
    close: () => void;
  } | null>(null);

  /** BootSequence.svelte — always mounted, rendered above every other
   * overlay (see that component's own z-index note). `isActive()` gates
   * ALL key handling below (checked first, ahead of even copy-mode);
   * `replay()` is invoked by the dashboard's `r` hotkey and the status-bar
   * ↻ reboot control. */
  let bootRef = $state<{ replay: () => void; isActive: () => boolean } | null>(null);

  /** Cmdline.svelte — always mounted, same contract as GrepOverlay/CopyMode
   * above. `isOpen()` is consulted by the tmux prefix
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
    /** Window-chrome contract, same shape as GrepOverlay/CopyMode's own
     * `close()` — called from
     * `closeWindowChrome()` (and therefore every window switch/kill/reboot,
     * all of which call it) so an open box never survives a window switch,
     * a program launch, or a detach. */
    close: () => void;
  } | null>(null);

  /** HelpSearch.svelte — same always-mounted / bind:this /
   * handleKey():boolean / isOpen() / close()
   * contract as Cmdline above; `openPalette()` is called from the bare-`?`
   * opener further down (mirroring the bare-`:` opener that calls
   * cmdlineRef.openSite()). */
  let helpSearchRef = $state<{
    isOpen: () => boolean;
    openPalette: () => void;
    close: () => void;
    handleKey: (e: KeyboardEvent) => boolean;
  } | null>(null);

  /** ChooseTree.svelte (`Ctrl-b w`) — same always-mounted / bind:this /
   * handleKey():boolean / isOpen()/close() contract as Cmdline/HelpSearch
   * above. `openOverlay()` is called from the prefix `w` binding;
   * `handleKey()` is consulted in its own documented slot (see ChooseTree.
   * svelte's own header comment) — after copy-mode and the prefix system,
   * before Cmdline/StatusBar/every view ref. */
  let chooseTreeRef = $state<{
    isOpen: () => boolean;
    openOverlay: () => void;
    close: () => void;
    handleKey: (e: KeyboardEvent) => boolean;
  } | null>(null);

  let notificationsRef = $state<{ handleKey: (e: KeyboardEvent) => boolean; close?: () => void } | null>(null);

  /** The tmux `Client` model, every derived read model over it, and every
   * window/pane/session/cmdline action — see terminalState.svelte.ts's own
   * header comment. Constructed with getter closures for every ref above
   * (the core class needs to reach them — e.g. `reboot()` closes every
   * overlay — but every ref variable itself stays declared here, per this
   * file's own role as the hub owning every `bind:this`) and for
   * `focusedRef()` (`runEditorExCommand`'s own delegation target).
   *
   * Deliberately NOT named `state` (the convention Repositories/Editor/
   * Notifications all use for their own instance): this file declares nine
   * `$state<{...}>(...)` refs ABOVE this line with an explicit generic type
   * argument, and naming this instance `state` breaks svelte2tsx's rune
   * recognition for every one of them (`pnpm check` fails with "Block-
   * scoped variable '$state' used before its declaration" +  "Untyped
   * function calls may not accept type arguments" on each) — confirmed by
   * renaming back and reproducing the 22 phantom errors. Repositories/Editor/
   * Notifications never hit this because none of them have a bare-generic
   * `$state<T>()` call textually before their own `const state = ...`. Do
   * not rename this back to `state`. */
  const core = new TerminalState(
    site,
    shell,
    cmdline,
    initialView,
    () => grepRef,
    () => statusBarRef,
    () => copyModeRef,
    () => bootRef,
    () => cmdlineRef,
    () => helpSearchRef,
    () => chooseTreeRef,
    () => notificationsRef,
    focusedRef,
  );

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

  // Mobile-block JS guard: listeners/timers only attach while the viewport
  // is desktop-sized with a fine pointer — the JS half of the guard whose
  // CSS half lives in Shell.astro (see that file's own comment); the
  // mobile-block card itself is server-rendered there, not by this
  // component. Kept reactive to live resizes.
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
  // early-returns (verified by e2e, tests/e2e/tmux.spec.ts's mobile-block
  // checks).
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

  /** The single key following an armed Ctrl-b. Always disarms. A held
   * modifier (e.g. Ctrl-d) is deliberately NOT treated as a prefix command
   * — disarm and fall through to the rest of handleKey unchanged, so e.g.
   * the Repositories/Personnel editor's own Ctrl-d/Ctrl-u half-page scroll still
   * works immediately after an (unused) Ctrl-b, and the global "modifier
   * combos fall through untouched" rule holds even mid-prefix. (Ctrl-b
   * itself is special-cased one level up, in handleKey(), as tmux's own
   * "send-prefix" binding — see that function's comment — so it never
   * reaches this modifier check at all on the second press.) */
  function handlePrefixedKey(e: KeyboardEvent): boolean {
    core.disarmPrefix();
    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (e.key === "Escape") return true; // cancel — swallowed, no action

    // While a status-bar prompt (rename/confirm) is open, it OWNS the
    // keyboard — the only prefixed key allowed through is `]` (paste into
    // the prompt's own registered paste target). Every other prefixed
    // command (digit targets, n/p, d/w/0, ,/&/x/[, ?) is inert here:
    // swallowed with zero side effects, leaving the prompt bound to
    // whatever window it was opened for. Without this gate, `Ctrl-b
    // <anything>` while a prompt was open would run the FULL prefix system
    // out from under it — switching the view while a stale rename prompt
    // for the OLD window stayed open (and committed onto the NEW one), or
    // silently replacing a rename prompt with a kill-window confirm. This
    // check must come before every other branch below, `]` excepted.
    //
    // The exact same gate extends to an open Cmdline box: while it's open
    // the prefix system treats it like the status prompts (only Ctrl-b arm
    // + ] allowed through) — this also means a prompt already open blocks
    // `Ctrl-b :` from opening the box at all (checked below, after this
    // combined gate): prompts win over opening the box. The same gate
    // extends a second time to the `?` HelpSearch palette — same modal,
    // same treatment.
    if (statusBarRef?.isPromptActive() || cmdlineRef?.isOpen?.() || helpSearchRef?.isOpen?.()) {
      if (e.key === "]") {
        e.preventDefault();
        core.pasteFromBuffer();
        return true;
      }
      if (e.key.length === 1) e.preventDefault();
      return true;
    }

    const target = core.prefixTargets[e.key];
    if (target) {
      e.preventDefault();
      core.switchToWindowById(target);
      return true;
    }

    const pk = e.key.toLowerCase();

    // While choose-tree is open, it owns the keyboard for its OWN
    // vocabulary via a LATER delegation slot (ChooseTree.svelte's own
    // `handleKey`, consulted after this whole function returns). Four
    // PREFIXED keys are gated OFF here specifically, though: `,`/`&`/`x`
    // (status-bar rename/kill prompts) and `:` (the Cmdline box) would each
    // pop a competing modal UNDERNEATH the overlay — since this component's
    // handleKey runs BEFORE StatusBar's/Cmdline's in the dispatch chain, that
    // prompt's own y/n/Enter keystrokes could never reach it, leaving it
    // permanently starved. Window-switch keys (digits, n/p)
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
      core.cyclePrefixView(1);
      return true;
    }
    if (pk === "p") {
      e.preventDefault();
      core.cyclePrefixView(-1);
      return true;
    }
    if (e.key === "0") {
      e.preventDefault();
      core.switchToProgram("dashboard");
      return true;
    }
    if (pk === "c") {
      // `c` is tmux new-window: creates a
      // fresh window running the in-window shell program and switches to it
      // immediately (see `createWindowInSession`'s own comment).
      e.preventDefault();
      core.createWindowInSession();
      return true;
    }
    if (pk === "w") {
      // `w` is real tmux choose-tree (`0` still always selects window 0,
      // unaffected). Closes grep/cmdline/palette first (window-chrome
      // contract) — reachable in practice only for grep (Cmdline/HelpSearch
      // being open already blocks every prefixed key including this one,
      // per the combined gate above), same "prefix precedence over grep"
      // rule every other window-switch prefix key already follows.
      e.preventDefault();
      core.closeWindowChrome();
      chooseTreeRef?.openOverlay();
      return true;
    }
    if (pk === "d") {
      // `d` is real tmux detach.
      e.preventDefault();
      core.detachSession();
      return true;
    }
    if (e.key === ",") {
      e.preventDefault();
      core.startRenamePrompt();
      return true;
    }
    if (e.key === "&") {
      e.preventDefault();
      core.startKillWindowConfirm();
      return true;
    }
    if (pk === "x") {
      e.preventDefault();
      core.startKillPaneConfirm();
      return true;
    }
    if (e.key === "[") {
      e.preventDefault();
      copyModeRef?.openOverlay();
      return true;
    }
    if (e.key === "]") {
      e.preventDefault();
      core.pasteFromBuffer();
      return true;
    }
    if (e.key === ":") {
      // Ctrl-b : — real tmux's own "command-prompt"
      // binding: opens the SAME floating box in its third mode
      // (tmuxCommands only — rename-window/kill-window/kill-pane/
      // select-window/select-layout). The combined isPromptActive/
      // cmdline-isOpen gate above already stops this from firing while
      // either modal system is already up.
      e.preventDefault();
      cmdlineRef?.openTmux();
      return true;
    }

    // `|`/`%` split RIGHT (row), `-`/`"` split BELOW (column).
    if (e.key === "|" || e.key === "%") {
      e.preventDefault();
      core.splitFocusedPane("row");
      return true;
    }
    if (e.key === "-" || e.key === '"') {
      e.preventDefault();
      core.splitFocusedPane("column");
      return true;
    }
    // Prefix `o` next-pane, `;` last-pane, arrow keys directional.
    if (pk === "o") {
      e.preventDefault();
      core.cycleFocusedPane();
      return true;
    }
    if (e.key === ";") {
      e.preventDefault();
      core.jumpToLastPane();
      return true;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir: PaneDirection =
        e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : e.key === "ArrowLeft" ? "left" : "right";
      core.navigateDirectional(dir);
      return true;
    }
    // Item 6.4 — prefix Space cycles the 7 preset layouts.
    if (e.key === " ") {
      e.preventDefault();
      core.cycleLayout();
      return true;
    }

    // Unrecognized prefixed key — tmux swallows it silently (no action);
    // only preventDefault a printable character (mirrors GrepOverlay's own
    // "swallow printable, let modifiers through" split).
    if (e.key.length === 1) e.preventDefault();
    return true;
  }

  function handleKey(e: KeyboardEvent) {
    // Boot is unskippable — there is no key or click
    // that jumps past it into the site (BootSequence.svelte's own header
    // comment). Checked before EVERYTHING else, including copy-mode, which
    // can't legitimately be open yet at this point anyway but is skipped
    // unconditionally here for the same reason the mock's own boot
    // componentDidMount only ever wires up its own `r`-on-ready check and
    // nothing else while booting.
    if (bootRef?.isActive?.()) return;

    // The copy-mode overlay is always-mounted / consulted-early,
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

    // Ctrl-b Ctrl-b — tmux's own default "send-prefix" binding: while
    // armed, a SECOND Ctrl-b disarms (like any other prefixed key) but,
    // uniquely, does NOT stop there — it falls through to the normal
    // view-delegation chain below as a literal keydown, which is what makes
    // vim's own Ctrl-b (full-page-back, `isEditorScrollChord` further down)
    // reachable at all: a bare Ctrl-b is otherwise always consumed by the
    // prefix-arm branch first. Every OTHER prefixed key instead re-arms
    // (see `armPrefix()`'s own re-entrant reset); this one uniquely does not.
    //
    // Gated behind `!isPromptActive()`: dispatching a
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
    if (core.prefixArmed) {
      if (
        !statusBarRef?.isPromptActive() &&
        !cmdlineRef?.isOpen?.() &&
        !helpSearchRef?.isOpen?.() &&
        e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.toLowerCase() === "b"
      ) {
        core.disarmPrefix();
        sendPrefixLiteral = true;
      } else if (handlePrefixedKey(e)) {
        return;
      }
      // A modifier combo mid-prefix (any other Ctrl/Meta/Alt chord):
      // disarmed inside handlePrefixedKey above, deliberately falls through
      // to grep/view handling below as if no prefix were armed.
    }

    // Ctrl-b arms the tmux prefix — checked BEFORE grep delegation,
    // tmux-faithful: the prefix works everywhere, including while the grep
    // overlay is open (needed for `Ctrl-b ]`'s paste into the grep query).
    // Only Ctrl-b itself is preventDefault-ed (global keymap rule: every
    // other modifier combo falls through untouched). Skipped when
    // `sendPrefixLiteral` is set above — this exact Ctrl-b keydown is the
    // second half of a send-prefix chord, not a fresh arm.
    //
    // While detached, the Ctrl-b prefix is INERT — no prefix arming —
    // `activeSession` gates the arm
    // itself (not e.g. a check inside `handlePrefixedKey`, which would only
    // stop DISPATCH, not arming): with no arm, `prefixArmed` simply never
    // becomes true while detached, so a bare Ctrl-b just falls through
    // untouched (no preventDefault either) like any other unrecognized
    // chord — the keydown reaches the host shell's own handler next, which
    // already refuses every ctrlKey-held combo (Shell.svelte's own
    // `handleKey` guard), so it's a true no-op, not merely "swallowed". */
    if (!sendPrefixLiteral && core.activeSession && e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      core.armPrefix();
      return;
    }

    // Choose-tree's own handleKey slot (documented keyboard-slot choice):
    // right after copy-mode AND after
    // the tmux prefix system has had its FULL turn (both dispatch of an
    // armed prefix above, AND arming a bare Ctrl-b immediately above this),
    // but before Cmdline/StatusBar/every view ref. Placing this AFTER the
    // arm-check (not merely after the dispatch block) is load-bearing: a
    // bare Ctrl-b keydown carries `ctrlKey: true`, which ChooseTree's own
    // `handleKey` swallows unconditionally (it owns the keyboard while
    // open) — if this check ran any earlier, a bare Ctrl-b could never even
    // ARM while choose-tree is open, making `Ctrl-b d` (detach, which must
    // still work) unreachable. With the slot here, the arm
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

    // A status-line prompt (rename/confirm) OWNS
    // the keyboard once it's open — but ONLY AFTER the prefix system above
    // has had its turn. This is "prefix precedence" extended to prompts
    // (mirroring the same rule this file already applies to GrepOverlay):
    // a prompt-open Ctrl-b must still be able to ARM (the two checks
    // above), and the very next prefixed key (e.g. `]`, which
    // pasteFromBuffer() below routes into the prompt's own registered
    // paste target) must still be able to DISPATCH — neither of which
    // could happen if this check ran first and swallowed both keydowns
    // before the prefix system ever saw them (that ordering bug: `Ctrl-b
    // ]` would silently type a literal `]` into the rename box instead of
    // pasting, because a top-of-function placement here would consume the
    // Ctrl-b that was supposed to arm it). Every OTHER key — plain typing,
    // Enter, Backspace, Escape — never matches the prefix system above (it
    // only reacts to an armed prefix or a bare Ctrl-b) and so still
    // reaches the prompt exactly as before.
    // The Cmdline box, once open, is checked at the top alongside
    // boot/copy-mode/status prompts — same relative position as
    // `statusBarRef.handleKey` immediately below (after the
    // prefix system has had its turn, for the same "Ctrl-b ] must still
    // reach it" reason spelled out in that check's own comment), and
    // mutually exclusive with it in practice: opening the box requires no
    // prompt to be active (see the fallback opener further down), and
    // opening a prompt while the box is open is impossible today (nothing
    // currently starts a rename/kill confirm from inside an open Cmdline).
    if (cmdlineRef?.handleKey(e)) return;

    // The `?` HelpSearch palette gets
    // the exact same relative slot as Cmdline immediately above it (right
    // after the prefix system, right before the status-bar prompt) — same
    // "Ctrl-b ] must still reach it" reasoning, and mutually exclusive with
    // Cmdline in practice (the combined isPromptActive/isOpen gate further
    // up already stops either one from opening while the other is up).
    if (helpSearchRef?.handleKey(e)) return;

    if (statusBarRef?.handleKey(e)) return;

    // Ctrl-d/Ctrl-u/Ctrl-f/Ctrl-b are reserved for the Repositories/Personnel file
    // editors' half/full-page scroll (the vim engine's Ctrl-f/b included) —
    // the one deliberate exception to "modifier combos fall through
    // untouched" so far (the tmux prefix above is Ctrl-b itself, which is
    // why a bare Ctrl-b never reaches this chord check: it's always
    // consumed by the prefix-arm branch first). Everything else still
    // falls through untouched.
    const isEditorScrollChord =
      e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      (e.key === "d" || e.key === "D" || e.key === "u" || e.key === "U" || e.key === "f" || e.key === "F" || e.key === "b" || e.key === "B");

    /** Tries the FOCUSED pane's own ref — the editor gate consults the
     * FOCUSED pane only, via one generic lookup through PaneTree's ref
     * registry, subject to the same "no bare modifier combos except the
     * editor scroll chord" gate every ref has always used. Whether the
     * widened (scroll-chord-permitting) gate applies is a CAPABILITY check
     * (does this ref export `isEditorOpen` at all?) rather than an
     * identity check (`view === "repositories"/"employment"`) — only
     * Repositories/EmploymentRecords ever do. Returns whether the key was consumed. */
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

    // Delegation flip: while the focused pane's vim Editor is open, it must
    // get first refusal ahead of GrepOverlay so `/` searches the open
    // buffer instead of opening grep — vim-faithful. Everywhere else (no
    // editor open), grep is consulted first, except that the tmux prefix
    // (above) runs ahead of it.
    const editorIsOpen = !!activeRef()?.isEditorOpen?.();

    // Focused-shell panes consume printable keys/Enter/Backspace/arrows
    // BEFORE grep's `/` opener — a shell pane gets the exact same first-refusal treatment an
    // open vim editor already does (both are "this pane owns its own text
    // input right now"), so `/`/`:`/`?` all type into the shell instead of
    // opening grep/Cmdline/HelpSearch. `editorIsOpen` itself stays scoped to
    // "an embedded vim Editor is open" for the ex-mode/`?`-exclusion checks
    // further down — a shell pane is never in "ex mode", it just never
    // reaches those checks at all (Shell.svelte's handleKey claims every
    // printable character first).
    //
    // Keyboard belongs to the host shell while detached — `!activeSession`
    // extends the exact same
    // greedy treatment to the host shell instance, which `activeRef()`
    // above already resolves to in that case. This is also what makes the
    // tmux prefix's own inertness complete: with the prefix never arming
    // (see `armPrefix()`'s gate) AND every other key claimed here by the
    // host shell, nothing below this line — grep/Cmdline/HelpSearch's own
    // fallback openers, the dashboard hotkeys — is ever reachable while
    // detached.
    const paneIsGreedy = editorIsOpen || core.activeProgram === "shell" || !core.activeSession;

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

    // Covers Repositories/Personnel's non-editor handling (e.g. Repositories' arrow-key
    // repo navigation) AND Profile's `r`/HelpView's arrow-key scroll — both
    // refs simply never export
    // `isEditorOpen`, so `editorIsOpen` is already false for them and this
    // one call reaches them in exactly the same relative position).
    if (!paneIsGreedy && tryFocusedRef()) {
      return;
    }

    // Fallback opener: a bare `:` that NOTHING above already consumed
    // opens the site-wide Cmdline box. Placed here — after every
    // text-input-owning consumer above has had its turn (grep's own query,
    // an open editor's `/` search, Personnel's filter mode, the status-bar
    // rename prompt) — for free: each of those already swallows every key
    // (including `:`) while it's active, so this line is simply never
    // reached while any of them own the keyboard, which is exactly "`:`
    // stays literal inside grep query/personnel filter/rename prompt" with
    // no extra core probes needed. `editorIsOpen` (computed above) picks
    // context (a) vs (b):
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

    // A bare `?` that NOTHING above already consumed opens the `?`
    // HelpSearch palette — mirrors the `:` fallback opener immediately
    // above in every way (same reasoning for why grep/cmdline/a status
    // prompt/copy-mode/boot are all already guaranteed inactive by the
    // time control reaches here — each of those consumes `?` itself while
    // active, exactly like `:`), EXCEPT one: unlike `:` (which still opens
    // Cmdline in "ex" mode while a file editor is open), `?` must NOT open
    // anything while an editor is open ("editor open (any mode)" is a full
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
    // regardless of which view is active (global keymap rule: modifier-held
    // keys fall through untouched).
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // Signal-inbox bell/panel (dashboard view only): a bare `n`
    // toggles the panel, `Esc` closes it (Notifications.svelte's own
    // handleKey only consumes Esc while the panel is actually open, so it
    // falls through otherwise). Placed in this same bare-key backstop
    // section as the reboot check below so it only ever fires once every
    // pane/overlay/input above has refused the keydown — an open editor,
    // shell pane, grep query, etc. all still win first refusal over `n`/Esc.
    if (core.view === "home" && notificationsRef?.handleKey(e)) {
      return;
    }

    const k = e.key.toLowerCase();

    // Global reboot backstop: a bare `r` reboots from anywhere, but only
    // once every pane/overlay/input above has refused it — a view whose
    // focused pane already binds `r` itself (e.g. Profile's resume
    // download, consumed by `tryFocusedRef()` earlier in this function)
    // never reaches this branch for that key.
    if (k === "r") {
      core.reboot();
      return;
    }
  }

  /** Popstate goes through the exact same `switchToWindowById` every other
   * window-switch path uses: closes grep/cmdline/help-palette, then
   * selects the DEFAULT session's window whose id matches the popped
   * route (a browser back/forward always lands on one of the six
   * canonical routes, never a mid-shell core) — maps route to session 0's
   * window if present, else no-op; no-op is automatic here since
   * `switchToWindowById` already no-ops for a missing id. `syncUrl()`
   * inside it never re-pushes: the browser has already updated
   * `location.pathname` to match by the time this fires. */
  function onPopState() {
    core.switchToWindowById(viewIdToProgram(pathToView(location.pathname)));
  }
</script>

<div
  data-testid="terminal-ready"
  data-terminal-ready={keysReady}
  style="position:relative;min-height:100vh;overflow:hidden;background:#0b0f14;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;color:#c9d1d9;animation:{dashIn
    ? 'bDashIn 1.05s cubic-bezier(.2,.7,.3,1) both'
    : 'none'}"
>
  <Wallpaper {tracker} view={core.view ?? "home"} dim={!core.activeSession} isRetinaFocused={core.activeProgram === "retina-v"} />

  {#if core.view === "home"}
    <!-- Dashboard-only central red glow — a fixed layer between the
         wallpaper and the pane content, never intercepting clicks. -->
    <div
      aria-hidden="true"
      style="position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(900px 520px at 50% 42%,rgba(229,72,77,.10),transparent 70%),radial-gradient(700px 400px at 82% 78%,rgba(79,209,197,.05),transparent 70%)"
    ></div>
  {/if}

  <div style="position:relative;z-index:2;height:100vh;overflow:hidden;display:flex;flex-direction:column">
    {#if core.activeSession}
      <!-- Attached — the non-null
           assertions below are safe: this whole branch only renders while
           `activeSession` (hence `activeWindow`) is defined. -->
      <Notifications
        bind:this={notificationsRef}
        {notifications}
        view={core.view!}
        fixtureMode={notificationsFixtureMode}
        bootActive={() => bootRef?.isActive?.() ?? false}
      />

      <PaneTree
        node={core.activeWindow!.root}
        activePaneId={core.activeWindow!.activePaneId}
        multiPane={core.multiPane}
        refs={paneRefs}
        {dashboard}
        windowNumberById={core.windowNumberById}
        paneCount={core.totalPaneCount}
        {repositories}
        {personnel}
        {profile}
        {help}
        {shell}
        {projects}
        {personnelEntries}
        {commitsByRepo}
        onWindowSwitch={core.switchToProgram}
        onLaunchInPane={core.onLaunchInPane}
        onExitPane={core.onExitPane}
        onReboot={core.reboot}
        shellMode={SHELL_MODE}
        viewNames={VIEW_NAMES}
        shellSession={core.shellSession}
        sessions={core.sessionsRoster}
        defaultSessionName={DEFAULT_SESSION_NAME}
      />

      <StatusBar
        bind:this={statusBarRef}
        {site}
        sessionName={core.activeSession!.name}
        windows={core.statusWindows}
        activeWindowId={core.activeWindow!.id}
        lastWindowId={core.lastWindowId}
        onSelect={core.switchToWindowById}
        onReboot={core.reboot}
      />
    {:else}
      <!-- Detached — the host shell,
           fullscreen over the dim radar: no Toasts (dashboard-only), no
           PaneTree/StatusBar (no session owns the screen). -->
      <Shell
        bind:this={hostShellRef}
        {shell}
        pane={core.client.hostPane}
        mode="host"
        viewNames={VIEW_NAMES}
        session={core.hostSessionSummary}
        sessions={core.sessionsRoster}
        defaultSessionName={DEFAULT_SESSION_NAME}
        onLaunch={() => {}}
        onExit={core.onHostExit}
        onReboot={core.reboot}
        onAttach={core.onHostAttach}
        onCreateAndAttach={core.onHostCreateAndAttach}
        onAttachView={core.onHostAttachView}
      />
    {/if}
  </div>

  <GrepOverlay bind:this={grepRef} {grep} onNavigate={core.switchToView} />
  <CopyMode bind:this={copyModeRef} copyMode={site.copyMode} />
  <BootSequence bind:this={bootRef} {boot} {desktopMode} onReady={onBootReady} />
  <Cmdline bind:this={cmdlineRef} {cmdline} onSubmit={core.onCmdlineSubmit} />
  <HelpSearch bind:this={helpSearchRef} {helpSearch} {cmdline} {help} {shell} onExecute={core.onHelpSearchExecute} />
  <ChooseTree
    bind:this={chooseTreeRef}
    client={core.client}
    {chooseTree}
    onSelectWindow={core.chooseTreeSelectWindow}
    onSelectSession={core.chooseTreeSelectSession}
    onKillWindow={core.chooseTreeKillWindow}
    onKillSession={core.chooseTreeKillSession}
  />
</div>
