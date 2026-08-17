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
    BootData,
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
  import BootSequence from "./BootSequence.svelte";

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
    boot: BootData;
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
    boot,
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

  /** Status-bar ↻ reboot control (PLAN.md Phase 5B item 5B.3) — replays
   * boot from ANY view by first switching home. Cancels a stray status-bar
   * prompt and a stray copy-mode overlay first (both hazards the plan
   * calls out explicitly: a rename/confirm prompt would otherwise survive
   * the switch bound to the old window, and copy-mode's own z-index sits
   * above the status bar so it would occlude the freshly-replayed boot).
   * `setView` already closes a stray grep overlay. */
  function reboot() {
    statusBarRef?.cancelPrompt?.();
    copyModeRef?.close?.();
    setView("home");
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

  /** Ctrl-b , — PLAN.md Phase 5 item 5.2. Takes the target window's id as an
   * explicit argument (captured by `startRenamePrompt` at PROMPT-OPEN time)
   * rather than re-deriving it from `view` here at commit time — defense in
   * depth (verifier round 2) so this can never rename the wrong window even
   * if some future delegation change let `view` drift while the prompt was
   * still open; today's `handlePrefixedKey` prompt-active gate already
   * makes that drift impossible, but this closure doesn't depend on that
   * invariant holding elsewhere. */
  function renameWindow(id: string, name: string) {
    windows = windows.map((w) => (w.id === id ? { ...w, name } : w));
  }

  /** Ctrl-b & (and the Builds single-pane Ctrl-b x fallback, and a
   * kill-pane that emptied the last Builds panel) — PLAN.md Phase 5 item
   * 5.2. Same "id captured at prompt-open time" hardening as `renameWindow`
   * above. Refuses (a status message, no removal) when only one window is
   * left; otherwise removes the target window and, if it was the one on
   * screen when the confirm opened, switches to whatever now sits at its
   * old index (i.e. the window that used to be right after it —
   * `remaining[idx]` — or wraps to the first remaining window if it was
   * last). Single source of behavior: every "kill this window" path in the
   * app funnels through here. */
  function killWindow(id: string) {
    if (windows.length <= 1) {
      statusBarRef?.showMessage(site.statusBar.prompts.killLastWindowMessage);
      return;
    }
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
    const id = activeWindowId(view);
    statusBarRef?.startRename(currentWindowName(), (name) => renameWindow(id, name));
  }

  function startKillWindowConfirm() {
    const id = activeWindowId(view);
    const text = site.statusBar.prompts.killWindowTemplate.replace("{name}", currentWindowName());
    statusBarRef?.startConfirm(text, () => killWindow(id));
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
    if (statusBarRef?.isPromptActive()) {
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
      if (!statusBarRef?.isPromptActive() && e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "b") {
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

    // PLAN.md Phase 5B item 5B.3: `r` on the ready dashboard replays boot
    // (mock's own `componentDidMount`'s `phase === "ready"` guard — by
    // construction here `view === "home"` already implies boot isn't
    // active, since the top-of-function gate above returns early while it
    // is). No conflict with Profile's own `r` (resume download): that's a
    // different view, handled by profileRef further up this function.
    if (k === "r") {
      bootRef?.replay();
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
  style="position:relative;min-height:100vh;overflow:hidden;background:#0b0f14;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;color:#c9d1d9;animation:{dashIn
    ? 'bDashIn 1.05s cubic-bezier(.2,.7,.3,1) both'
    : 'none'}"
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

    <StatusBar bind:this={statusBarRef} {site} {windows} {view} onSelect={setView} onReboot={reboot} />
  </div>

  <GrepOverlay bind:this={grepRef} {grep} onNavigate={setView} />
  <CopyMode bind:this={copyModeRef} copyMode={site.copyMode} />
  <BootSequence bind:this={bootRef} {boot} {desktopMode} onReady={onBootReady} />
</div>
