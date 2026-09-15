<script lang="ts">
  // Single Svelte island mounted by every route page: owns the tmux client/session/window/pane
  // model (src/common/engines/tmux/tmux.ts), the global keymap, and pushState/popstate URL sync.
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
  import type { Commit } from "../common/lib/commits";
  import type { ViewId } from "../common/lib/views";
  import { pathToView, viewIdToProgram } from "../common/lib/views";
  import type { Pane, PaneDirection } from "../common/engines/tmux/tmux";
  import type { ShellMode } from "../common/lib/shell";
  import { TerminalState, DEFAULT_SESSION_NAME } from "./terminalState.svelte";
  import Wallpaper from "../common/components/Wallpaper.svelte";
  import StatusBar from "../common/components/StatusBar.svelte";
  import PaneTree from "../common/components/PaneTree.svelte";
  import Dashboard from "../features/dashboard/components/Dashboard.svelte";
  import Repositories from "../features/repositories/components/Repositories.svelte";
  import EmploymentRecords from "../features/employment/components/EmploymentRecords.svelte";
  import Profile from "../features/profile/components/Profile.svelte";
  import HelpView from "../features/help/components/HelpView.svelte";
  import Shell from "../features/shell-fs/components/Shell.svelte";
  import Notifications from "../features/notifications/components/Notifications.svelte";
  import GrepOverlay from "../features/grep/components/GrepOverlay.svelte";
  import CopyMode from "../common/components/CopyMode.svelte";
  import ChooseTree from "../common/components/ChooseTree.svelte";
  import BootSequence from "../features/boot/components/BootSequence.svelte";
  import Cmdline from "../common/components/Cmdline.svelte";
  import HelpSearch from "../features/help/components/HelpSearch.svelte";

  /** Unified optional-methods contract every mounted program component's
   * `bind:this` ref may expose, since PaneTree.svelte's single ref registry
   * looks all of them up through one shape.
   *
   * Every field stays optional:
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
    /** Server-computed `process.env.PORTFOLIO_FIXTURES === "1"` (read in
     * bootstrap/loadAll.ts's loadTerminalProps, never client-side — see
     * Notifications.svelte's own header comment for why).
     *
     * Gates the notification system into a
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
  const VIEW_NAMES = [
    "dashboard",
    "repositories",
    "employment",
    "retina-v",
    "profile",
    "help",
  ] as const;

  /** Every in-pane Shell instance is "pane" mode; the one host-shell
   * instance rendered directly below (not through PaneTree) is "host" mode —
   * see the template's `{#if activeSession}...{:else}...{/if}` split. */
  const SHELL_MODE: ShellMode = "pane";

  /** Shared, non-reactive pane-ref registry created once here and threaded down
   * through every recursive `<PaneTree>`/`<svelte:self>` instance as a plain prop,
   * since a per-instance map would only ever see whichever leaf renders at the root
   * once a window splits. */
  const paneRefs = new Map<string, unknown>();

  /** The one HOST-mode Shell instance — rendered directly in the template
   * below (never through PaneTree, since there's no window/pane tree to
   * render while detached).
   *
   * `handleKey` is the only member `activeRef()`
   * below ever needs from it. */
  let hostShellRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** Returns the currently-focused pane's ref (if it exposes one) — see
   * `paneRefs`'s own comment.
   *
   * Recomputed fresh on every call rather than
   * cached.
   *
   * `undefined` while detached (no pane is focused then) — see
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
   * whatever pane happens to be focused.
   *
   * Kill-pane/rename/ex-command call
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
   * handleKey():boolean contract as GrepOverlay. */
  let copyModeRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    openOverlay: () => void;
    close: () => void;
  } | null>(null);

  /** BootSequence.svelte — always mounted, rendered above every other
   * overlay (see that component's own z-index note).
   *
   * `isActive()` gates
   * ALL key handling below (checked first, ahead of even copy-mode);
   * `replay()` is invoked by the dashboard's `r` hotkey and the status-bar
   * ↻ reboot control. */
  let bootRef = $state<{ replay: () => void; isActive: () => boolean } | null>(null);

  /** Cmdline.svelte — always mounted, same contract as GrepOverlay/CopyMode
   * above.
   *
   * `isOpen()` is consulted by the tmux prefix
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
   * above.
   *
   * `openOverlay()` is called from the prefix `w` binding;
   * `handleKey()` is consulted in its own documented slot (see ChooseTree.
   * svelte's own header comment) — after copy-mode and the prefix system,
   * before Cmdline/StatusBar/every view ref. */
  let chooseTreeRef = $state<{
    isOpen: () => boolean;
    openOverlay: () => void;
    close: () => void;
    handleKey: (e: KeyboardEvent) => boolean;
  } | null>(null);

  let notificationsRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    close?: () => void;
  } | null>(null);

  /** Constructed here as `core`, never `state`: naming it `state` breaks svelte2tsx's
   * rune recognition for the explicit-generic `$state<{...}>()` refs declared above it. */
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
    { "?": "help" },
  );

  /** Plays the mock's `bDashIn` entrance animation on the site chrome the
   * moment a real boot hands off to the ready dashboard (BootSequence's
   * `onReady` callback — never fires on the sessionStorage skip path,
   * since there's nothing to "hand off" from there).
   *
   * Cleared ~1.05s later
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
  // CSS half lives in Layout.astro (see that file's own comment); the
  // mobile-block card itself is server-rendered there, not by this
  // component.
  //
  // Kept reactive to live resizes.
  let desktopMode = $state(false);

  // Set once the real keydown/popstate listeners are attached (below).
  //
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
  // early-returns (verified by e2e, src/common/tests/ui/e2e/tmux.spec.ts's
  // mobile-block checks).
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

  /** The single key following an armed Ctrl-b.
   *
   * Always disarms.
   *
   * A held
   * modifier (e.g. Ctrl-d) is deliberately NOT treated as a prefix command
   * — disarm and fall through to the rest of handleKey unchanged, so e.g.
   * the Repositories/Personnel editor's own Ctrl-d/Ctrl-u half-page scroll still
   * works immediately after an (unused) Ctrl-b, and the global "modifier
   * combos fall through untouched" rule holds even mid-prefix.
   *
   * (Ctrl-b
   * itself is special-cased one level up, in handleKey(), as tmux's own
   * "send-prefix" binding — see that function's comment — so it never
   * reaches this modifier check at all on the second press.) */
  function handlePrefixedKey(e: KeyboardEvent): boolean {
    core.disarmPrefix();
    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (e.key === "Escape") return true; // cancel — swallowed, no action

    // While a status-bar prompt, the Cmdline box, or the `?` HelpSearch palette is
    // open, it owns the keyboard and only Ctrl-b arm + `]` (paste) pass through the
    // prefix system, checked before every other branch below.
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

    // While choose-tree is open, its own later `handleKey` slot owns its vocabulary,
    // but prefixed `,`/`&`/`x`/`:` are gated off here since they'd pop a competing
    // modal underneath the overlay that could never receive its own keystrokes, while
    // window-switch/detach keys are left ungated since those already close the overlay for free.
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
      // unaffected).
      //
      // Closes grep/cmdline/palette first (window-chrome
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
      // select-window/select-layout).
      //
      // The combined isPromptActive/
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
    if (
      e.key === "ArrowUp" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight"
    ) {
      e.preventDefault();
      const dir: PaneDirection =
        e.key === "ArrowUp"
          ? "up"
          : e.key === "ArrowDown"
            ? "down"
            : e.key === "ArrowLeft"
              ? "left"
              : "right";
      core.navigateDirectional(dir);
      return true;
    }
    // Prefix Space cycles the 7 preset layouts.
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
    // comment).
    //
    // Checked before EVERYTHING else, including copy-mode, which
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

    // Ctrl-b Ctrl-b is tmux's own default "send-prefix" binding: a second Ctrl-b
    // while armed disarms like any other prefixed key but uniquely falls through
    // as a literal keydown (making vim's own Ctrl-b page-back reachable), except
    // while a status-bar prompt is active, when the prompt-owns-the-keyboard
    // invariant makes it fully inert instead.
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

    // Ctrl-b arms the tmux prefix, checked before grep delegation so the prefix
    // works even while the grep overlay is open (needed for `Ctrl-b ]` paste),
    // but is inert while detached since `activeSession` gates the arm itself
    // rather than dispatch.
    if (
      !sendPrefixLiteral &&
      core.activeSession &&
      e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      e.key.toLowerCase() === "b"
    ) {
      e.preventDefault();
      core.armPrefix();
      return;
    }

    // Choose-tree's own handleKey slot sits right after the prefix system has had
    // its full turn (both dispatch and arm) so a bare Ctrl-b can still arm and
    // `Ctrl-b d`/`Ctrl-b <digit>/n/p` still detach or switch windows while
    // choose-tree is open, closing the overlay for free.
    if (chooseTreeRef?.handleKey(e)) return;

    // A status-line prompt or the Cmdline box owns the keyboard once open, but only
    // after the prefix system above has had its turn, so an open prompt's Ctrl-b can
    // still arm and the following `]` can still dispatch into its paste target instead
    // of typing a literal `]`.
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
    // consumed by the prefix-arm branch first).
    //
    // Everything else still
    // falls through untouched.
    const isEditorScrollChord =
      e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      (e.key === "d" ||
        e.key === "D" ||
        e.key === "u" ||
        e.key === "U" ||
        e.key === "f" ||
        e.key === "F" ||
        e.key === "b" ||
        e.key === "B");

    /** Tries the FOCUSED pane's own ref — the editor gate consults the
     * FOCUSED pane only, via one generic lookup through PaneTree's ref
     * registry, subject to the same "no bare modifier combos except the
     * editor scroll chord" gate every ref has always used.
     *
     * Whether the
     * widened (scroll-chord-permitting) gate applies is a CAPABILITY check
     * (does this ref export `isEditorOpen` at all?) rather than an
     * identity check (`view === "repositories"/"employment"`).
     *
     * Returns whether the key was consumed. */
    function tryFocusedRef(): boolean {
      const ref = activeRef();
      if (!ref?.handleKey) return false;
      const supportsScrollChord = typeof ref.isEditorOpen === "function";
      const modifierOk =
        (supportsScrollChord && isEditorScrollChord) || !(e.metaKey || e.ctrlKey || e.altKey);
      if (!modifierOk) return false;
      if (ref.handleKey(e)) {
        e.preventDefault();
        return true;
      }
      return false;
    }

    // Delegation flip: while the focused pane's vim Editor is open, it must
    // get first refusal ahead of GrepOverlay so `/` searches the open
    // buffer instead of opening grep — vim-faithful.
    //
    // Everywhere else (no
    // editor open), grep is consulted first, except that the tmux prefix
    // (above) runs ahead of it.
    const editorIsOpen = !!activeRef()?.isEditorOpen?.();

    // Focused-shell panes (and the host shell while detached, via `!activeSession`)
    // consume printable keys/Enter/Backspace/arrows before grep's `/` opener, the same
    // first-refusal treatment an open vim editor gets, which is also what makes the
    // tmux prefix's own inertness while detached complete.
    const paneIsGreedy = editorIsOpen || core.activeProgram === "shell" || !core.activeSession;

    if (paneIsGreedy && tryFocusedRef()) {
      return;
    }

    // GrepOverlay.svelte owns "/" (open) and every key while it's already
    // open.
    //
    // GrepOverlay.handleKey() calls e.preventDefault() itself exactly
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

    // Fallback opener: a bare `:` nothing above already consumed opens the
    // site-wide Cmdline box, in ex mode when a file editor is open and site
    // mode everywhere else, with only meta/ctrl/alt excluded so Shift+":" still opens it.
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === ":") {
      e.preventDefault();
      if (editorIsOpen) cmdlineRef?.openEx();
      else cmdlineRef?.openSite();
      return;
    }

    // A bare `?` nothing above already consumed opens the HelpSearch palette,
    // mirroring the `:` fallback opener above except that it's fully excluded
    // (not just mode-switched) while a file editor is open, since Editor.svelte's
    // own handleKey already returns false for an unrecognized `?`.
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
    // falls through otherwise).
    //
    // Placed in this same bare-key backstop
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
   * `switchToWindowById` already no-ops for a missing id.
   *
   * `syncUrl()`
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
  <Wallpaper
    {tracker}
    view={core.view ?? "home"}
    dim={!core.activeSession}
    isRetinaFocused={core.activeProgram === "retina-v"}
  />

  {#if core.view === "home"}
    <!-- Dashboard-only central red glow — a fixed layer between the
         wallpaper and the pane content, never intercepting clicks. -->
    <div
      aria-hidden="true"
      style="position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(900px 520px at 50% 42%,rgba(229,72,77,.10),transparent 70%),radial-gradient(700px 400px at 82% 78%,rgba(79,209,197,.05),transparent 70%)"
    ></div>
  {/if}

  <div
    style="position:relative;z-index:2;height:100vh;overflow:hidden;display:flex;flex-direction:column"
  >
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

      <!-- This composition root owns the program→component switch (R004:
           common/ never depends on a feature, so only bootstrap may name
           one) — PaneTree renders the shared leaf wrapper/focus ring and
           calls this snippet with the leaf's own `pane`, its computed
           `isFocused`, and a getter/setter pair for THAT `<svelte:self>`
           instance's own `leafRef` — a Svelte 5 function binding
           (`bind:this={get, set}`), never a variable scoped to this file,
           so each leaf instance keeps registering/unregistering only
           itself in `paneRefs` below (see that Map's own comment). -->
      {#snippet paneLeaf(
        pane: Pane,
        isFocused: boolean,
        getLeafRef: () => unknown,
        setLeafRef: (ref: unknown) => void,
      )}
        {#if pane.program === "dashboard"}
          <!-- Dashboard menu clicks are all just "switch to a different WINDOW"
               (exactly like a status-bar click or a prefix digit target) — never a
               program LAUNCH into the current pane — so they all funnel through
               `core.switchToProgram`, keyed by the target window's canonical
               program id. `windowNumbers`/`paneCount` feed Dashboard's own
               hotkey-column lookup and footer sync line. -->
          <Dashboard
            {dashboard}
            {isFocused}
            windowNumbers={core.windowNumberById}
            paneCount={core.totalPaneCount}
            onSelect={(v) => core.switchToProgram(viewIdToProgram(v))}
          />
        {:else if pane.program === "retina-v"}
          <!-- The full-opacity map/HUD is Wallpaper's own view-gated opacity
               (rendered once, behind every window, by Terminal.svelte) — this
               branch is otherwise empty. The filler
               div keeps the flex column's layout identical to every other
               window (StatusBar still pinned to the bottom). -->
          <div style="flex:1;min-height:0"></div>
        {:else if pane.program === "repositories"}
          <Repositories
            bind:this={getLeafRef, setLeafRef}
            {repositories}
            {projects}
            {commitsByRepo}
            {isFocused}
          />
        {:else if pane.program === "employment"}
          <EmploymentRecords
            bind:this={getLeafRef, setLeafRef}
            {personnel}
            {personnelEntries}
            {isFocused}
          />
        {:else if pane.program === "help"}
          <HelpView bind:this={getLeafRef, setLeafRef} {help} {isFocused} />
        {:else if pane.program === "profile"}
          <Profile bind:this={getLeafRef, setLeafRef} {profile} {isFocused} />
        {:else}
          <!-- Shell.svelte's own three effects: launching a program IN THIS PANE
               (bare view-name commands/`open <view>`, never a window switch),
               exiting THIS pane's program back to a shell (`exit` — cascades
               like kill-pane), and `reboot`. `sessions` is forwarded straight
               through so `tmux ls` (which lists every session, not just this
               one) works from a pane too, not only the host shell — see
               Shell.svelte's own prop doc comment. -->
          <Shell
            bind:this={getLeafRef, setLeafRef}
            {shell}
            {pane}
            mode={SHELL_MODE}
            viewNames={VIEW_NAMES}
            session={core.shellSession}
            sessions={core.sessionsRoster}
            defaultSessionName={DEFAULT_SESSION_NAME}
            {isFocused}
            onLaunch={(program) => core.onLaunchInPane(pane.id, program)}
            onExit={() => core.onExitPane(pane.id)}
            onReboot={core.reboot}
          />
        {/if}
      {/snippet}

      <PaneTree
        node={core.activeWindow!.root}
        activePaneId={core.activeWindow!.activePaneId}
        multiPane={core.multiPane}
        refs={paneRefs}
        {paneLeaf}
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
  <HelpSearch
    bind:this={helpSearchRef}
    {helpSearch}
    {cmdline}
    {help}
    {shell}
    onExecute={core.onHelpSearchExecute}
  />
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
