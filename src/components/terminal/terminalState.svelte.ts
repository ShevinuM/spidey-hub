// TerminalState — Terminal.svelte's reactive core (the tmux `Client` model,
// every derived read model over it, and every window/pane/session/cmdline
// action) extracted during the folder+state-class relocation refactor. See
// Terminal.svelte's own header comment for the view's behavior; every
// `$state`/`$derived` here (and its accompanying comment) is moved verbatim
// from the original monolith — no reactivity, timing, or behavior change.
// The keymap itself (handleKey/handlePrefixedKey/onPopState), the global
// keydown/popstate listener registration, and every `bind:this` ref stay on
// Terminal.svelte, the orchestrator — see that file's own comment. Every
// function here that Terminal.svelte's template passes by bare reference
// as a child callback prop (e.g. `onWindowSwitch={state.switchToProgram}`)
// is declared as an arrow-function field so `this` stays bound once the
// reference leaves this class; functions only ever invoked via `state.foo()`
// from within Terminal.svelte's own dispatch code are plain methods.
import { tick } from "svelte";
import type { SiteData, ShellData, CmdlineData } from "../../lib/data";
import type { ViewId } from "../../lib/views";
import { VIEW_ROUTES, programToViewId, viewIdToProgram, windowIdToView } from "../../lib/views";
import type { Client, ProgramName, Session, LayoutName, PaneDirection } from "../../lib/tmux";
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
} from "../../lib/tmux";
import type { SessionRosterEntry, ShellLineKind } from "../../lib/shell";
import { seedHostNarrative } from "../../lib/shell";
import { resolvePageEpoch } from "../../lib/clock";
import { getPasteBuffer } from "../../lib/pasteBuffer";
import { getActivePasteTarget } from "../../lib/pasteTargets";
import { parseInput, parseTmuxCommand, resolveCommand } from "../../lib/cmdline";
import { downloadResume } from "../../lib/resume";

/** Mirrors Cmdline.svelte's own `CmdlineMode` export structurally — a plain
 * .ts module can't import a named type from a .svelte file under `tsc`
 * (only svelte-check's virtual modules allow that, and this file is also
 * type-checked by plain tsc via `pnpm check`), so this is kept in sync by
 * shape rather than by import. Cmdline.svelte remains the source of truth. */
type CmdlineMode = "site" | "ex" | "tmux";

/** Mirrors Terminal.svelte's own `ProgramRef` interface structurally, same
 * reason as `CmdlineMode` above. Terminal.svelte remains the source of
 * truth. */
interface ProgramRef {
  handleKey?: (e: KeyboardEvent) => boolean;
  isEditorOpen?: () => boolean;
  runEditorExCommand?: (cmd: string) => { recognized: boolean; error?: string };
}

/** Every one of these mirrors the exact inline `bind:this` ref shape
 * Terminal.svelte declares for the given always-mounted overlay/status
 * component — duplicated structurally (same reasoning as `CmdlineMode`
 * above) so this file's getter-closure constructor params can be typed
 * without importing from a `.svelte` file. Terminal.svelte's own inline
 * types remain the source of truth; TypeScript's structural typing accepts
 * Terminal's `$state<{...}> | null` ref variables wherever these are
 * expected. */
interface GrepRef {
  handleKey: (e: KeyboardEvent) => boolean;
  close?: () => void;
  isOpen?: () => boolean;
  openWithQuery?: (query: string) => void;
}
interface StatusBarRef {
  handleKey: (e: KeyboardEvent) => boolean;
  isPromptActive: () => boolean;
  showMessage: (text: string) => void;
  startRename: (initial: string, onCommit: (name: string) => void) => void;
  startConfirm: (text: string, onYes: () => void) => void;
  cancelPrompt: () => void;
}
interface CopyModeRef {
  handleKey: (e: KeyboardEvent) => boolean;
  openOverlay: () => void;
  close: () => void;
}
interface BootRef {
  replay: () => void;
  isActive: () => boolean;
}
interface CmdlineRef {
  isOpen: () => boolean;
  openSite: () => void;
  openEx: () => void;
  openTmux: () => void;
  handleKey: (e: KeyboardEvent) => boolean;
  close: () => void;
}
interface HelpSearchRef {
  isOpen: () => boolean;
  openPalette: () => void;
  close: () => void;
  handleKey: (e: KeyboardEvent) => boolean;
}
interface ChooseTreeRef {
  isOpen: () => boolean;
  openOverlay: () => void;
  close: () => void;
  handleKey: (e: KeyboardEvent) => boolean;
}
interface NotificationsRef {
  handleKey: (e: KeyboardEvent) => boolean;
  close?: () => void;
}

/** The initial factory session's stable identity — a synthetic internal
 * id, distinct from its user-visible NAME ("10.42.7.13"). URL sync
 * (`syncUrl` below) only applies while this specific session is attached;
 * other sessions created via `tmux new` don't have their own routes.
 * `DEFAULT_SESSION_NAME` is also re-exported for Terminal.svelte's own
 * template (`defaultSessionName` prop threaded to PaneTree/Shell) — see
 * that file's own import of it. */
const DEFAULT_SESSION_ID = "default";
export const DEFAULT_SESSION_NAME = "10.42.7.13";

// tmux prefix timeout — Ctrl-b arms a 2s window during which the very next
// key is a window-switch command instead of reaching any view. See the
// `armPrefix`/`disarmPrefix` methods' own section comment below.
const PREFIX_TIMEOUT_MS = 2000;

export class TerminalState {
  client: Client;

  constructor(
    private readonly site: SiteData,
    private readonly shell: ShellData,
    private readonly cmdlineData: CmdlineData,
    initialView: ViewId,
    private readonly getGrepRef: () => GrepRef | null,
    private readonly getStatusBarRef: () => StatusBarRef | null,
    private readonly getCopyModeRef: () => CopyModeRef | null,
    private readonly getBootRef: () => BootRef | null,
    private readonly getCmdlineRef: () => CmdlineRef | null,
    private readonly getHelpSearchRef: () => HelpSearchRef | null,
    private readonly getChooseTreeRef: () => ChooseTreeRef | null,
    private readonly getNotificationsRef: () => NotificationsRef | null,
    private readonly getFocusedRef: () => ProgramRef | undefined,
  ) {
    // Deliberately an "uncontrolled" seed, not a tracked binding: each route
    // page SSRs Terminal exactly once with the view matching its own URL, and
    // every subsequent view change is client-side (setView/popstate below) —
    // `initialView` itself never changes again for the lifetime of this
    // island, so there is nothing to re-sync. (svelte-autofixer flags this
    // shape as `state_referenced_locally` on any `$state(prop)` seed; that is
    // the documented pattern for uncontrolled initial values and is
    // intentional here.)
    this.client = $state(
      createFactoryClient({
        sessionId: DEFAULT_SESSION_ID,
        sessionName: DEFAULT_SESSION_NAME,
        windows: this.site.statusBar.windows,
        epoch: resolvePageEpoch(),
        activeWindowId: viewIdToProgram(initialView),
        hostNarrative: seedHostNarrative(this.shell, DEFAULT_SESSION_NAME),
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Derived read models over `client`
  // -----------------------------------------------------------------------

  /** `undefined` once detached — no
   * session owns the keyboard, the host shell does instead (see
   * `Client.attachedSessionId`'s own comment). Every function below that
   * assumes this is defined is only ever reachable from a UI path that
   * itself only exists while attached (PaneTree/StatusBar aren't even
   * mounted while detached, and the tmux prefix is inert then too — see
   * `armPrefix()`'s own gate) — EXCEPT `switchActiveWindow` (popstate can
   * fire regardless of attachment), which guards explicitly. */
  activeSession = $derived.by(() => activeSessionOf(this.client));
  activeWindow = $derived(this.activeSession ? activeWindowOf(this.activeSession) : undefined);
  activePane = $derived(this.activeWindow ? focusedPane(this.activeWindow) : undefined);
  activeProgram = $derived(this.activePane?.program);

  /** Whether the active window has
   * more than one pane right now; gates PaneTree's active-pane border
   * accent (a single-pane window shows no border, matching real tmux — see
   * PaneTree.svelte's own header comment). */
  multiPane = $derived(this.activeWindow ? allPanes(this.activeWindow.root).length > 1 : false);

  /** Live pane count across every window of the active session — the
   * dashboard footer's "synced N/N panes" line reads this instead of a
   * hardcoded number. 0 while detached (no session owns any panes then). */
  totalPaneCount = $derived(this.activeSession ? this.activeSession.windows.reduce((sum, w) => sum + allPanes(w.root).length, 0) : 0);

  /** StatusBar's real tmux `-` flag — the session's previously-active window.
   * Undefined on a fresh session (activeWindowIdx === lastWindowIdx) or
   * while detached, same as real tmux showing no `-` until a switch has
   * actually happened. */
  lastWindowId = $derived.by(() => {
    const s = this.activeSession;
    if (!s || s.lastWindowIdx === s.activeWindowIdx) return undefined;
    return s.windows[s.lastWindowIdx]?.id;
  });

  /** "Which WINDOW (screen) is on-screen" — keyed off the window's own
   * stable id, NOT the program its pane currently runs (see this file's own
   * header comment on why those differ, since a pane can run any program
   * in any window). Drives Wallpaper's opacity/blur knob and the
   * dashboard-only hotkey gate below. `undefined` while detached — there
   * is no "on-screen window" then. */
  view = $derived(this.activeWindow ? windowIdToView(this.activeWindow.id) : undefined);

  /** Status bar's own window list, re-derived from the live model on every
   * change — same shape (`{number, id, name}`) StatusBar.svelte has always
   * taken, just sourced from `client` instead of a separate `windows` $state
   * array. Empty while detached (StatusBar isn't even mounted then — see
   * the template). */
  statusWindows = $derived(this.activeSession ? this.activeSession.windows.map((w) => ({ number: w.number, id: w.id, name: w.name })) : []);

  /** Window id (a `ProgramName`) -> its live tmux window number — the
   * dashboard menu's hotkey column reads this so it always shows the real
   * `C-b N` binding for a view instead of a fixed table, even if window
   * numbers ever shift (a window closing, a future reorder). Empty while
   * detached, same as `statusWindows` above. */
  windowNumberById = $derived.by((): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const w of this.statusWindows) m[w.id] = w.number;
    return m;
  });

  /** Shell.svelte's own `session` prop (`tmux ls`'s anchor) — every
   * IN-PANE shell's anchor session (its own).
   * Falls back to a harmless zero-value shape while detached (unreachable
   * in practice — no pane is mounted then — kept only so this derived never
   * throws). */
  shellSession = $derived.by(() => {
    const s = this.activeSession;
    if (!s) return { name: "", windowCount: 0, createdAt: resolvePageEpoch(), attached: false };
    return { name: s.name, windowCount: s.windows.length, createdAt: s.createdAt, attached: this.client.attachedSessionId === s.id };
  });

  /** Every session the client
   * currently knows about, in the exact shape src/lib/shell.ts's
   * `RunContext.sessions` wants — computed fresh on every keystroke/render
   * so `tmux ls`/`new`/`a`/`attach`'s validation always sees the live
   * roster. Threaded to BOTH pane-mode Shell instances (via PaneTree) and
   * the host-mode one below — `tmux ls` works everywhere. */
  sessionsRoster = $derived.by(() =>
    this.client.sessions.map(
      (s): SessionRosterEntry => ({
        id: s.id,
        name: s.name,
        windowCount: s.windows.length,
        createdAt: s.createdAt,
        attached: this.client.attachedSessionId === s.id,
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
   * been destroyed (the `[exited]` end-state — `client.sessions` can be
   * legitimately empty there). */
  hostSessionSummary = $derived.by(() => {
    const s = this.client.sessions[0];
    return s
      ? { name: s.name, windowCount: s.windows.length, createdAt: s.createdAt, attached: false }
      : { name: "", windowCount: 0, createdAt: resolvePageEpoch(), attached: false };
  });

  /** Digit/`?` prefix targets, recomputed from the live window list so a
   * killed window's digit stops doing anything (tmux-faithful: an unbound
   * prefixed key is silently swallowed) — holding window ids, keyed off
   * each window's own `number` field (`Ctrl-b c` new-window included)
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
  prefixTargets = $derived.by((): Partial<Record<string, string>> => {
    const targets: Partial<Record<string, string>> = {};
    for (const w of this.statusWindows) {
      if (w.number >= 1 && w.number <= 9) targets[String(w.number)] = w.id;
    }
    if (this.statusWindows.some((w) => w.id === "help")) targets["?"] = "help";
    return targets;
  });

  // -----------------------------------------------------------------------
  // Window switching
  // -----------------------------------------------------------------------

  /** Window-chrome contract ("close BEFORE the same-view early return") —
   * closes grep/cmdline/help-palette/choose-tree unconditionally. Called at
   * the top of every window-switch/kill/reboot path below, so an open
   * overlay never survives ANY of them, even ones that end up no-op'ing
   * (e.g. selecting the already-active window, or a kill that gets
   * refused). Choose-tree's own Enter-switch already calls its own
   * `close()` directly, but every OTHER window-switch entry point (status-
   * bar click, prefix digit/n/p, dashboard hotkeys, `Ctrl-b d` detach) goes
   * through this helper — closing it here too means choose-tree never
   * survives any of THOSE either. */
  closeWindowChrome(): void {
    this.getGrepRef()?.close?.();
    this.getCmdlineRef()?.close?.();
    this.getHelpSearchRef()?.close?.();
    this.getChooseTreeRef()?.close?.();
  }

  /** pushState only when the ACTIVE PANE's program is canonical (not
   * "shell") AND the default session is attached — a shelled-in pane
   * freezes the URL wherever it already was.
   * Idempotent: a no-op when the route already matches (true for every
   * within-session switch that lands back on a window it started on, and
   * for popstate, which has already updated `location.pathname` itself). */
  syncUrl(): void {
    if (this.client.attachedSessionId !== DEFAULT_SESSION_ID) return;
    // `attachedSessionId === DEFAULT_SESSION_ID` already implies
    // `activeSession`/`activeProgram` are defined (only true while
    // attached) — the assertion is safe by construction, not a guess.
    const vid = programToViewId(this.activeProgram!);
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
  switchActiveWindow(pickIndex: (session: Session) => number): void {
    this.closeWindowChrome();
    const session = this.activeSession;
    // Detached: popstate is the one caller reachable
    // regardless of attachment (a browser back/forward can fire after
    // `Ctrl-b d`) — every OTHER caller (status-bar click, prefix nav,
    // dashboard hotkeys) only exists while attached. No session to switch
    // within, so this is a no-op — "maps route -> session 0 window if
    // present, else no-op" already covers "no session at all" the same way.
    if (!session) return;
    selectWindowIndex(session, pickIndex(session));
    this.syncUrl();
  }

  switchToWindowById = (id: string): void => {
    this.switchActiveWindow((session) => session.windows.findIndex((w) => w.id === id));
  };

  /** Every one of the six windows' own id equals its canonical program name
   * in the default session (see tmux.ts's `FactorySeed` comment) — so
   * "switch to the window that runs program X" is just
   * `switchToWindowById(program)`. Used by the dashboard menu, Personnel's
   * "onDashboard", GrepOverlay's Enter-routing, and Cmdline/HelpSearch's
   * `view:*` actions — every one of them a WINDOW switch, never a program
   * launch into the current pane. */
  switchToProgram = (program: ProgramName): void => {
    this.switchToWindowById(program);
  };

  switchToView = (v: ViewId): void => {
    this.switchToProgram(viewIdToProgram(v));
  };

  /** Ctrl-b n/p. */
  cyclePrefixView(dir: 1 | -1): void {
    this.switchActiveWindow((session) => {
      const len = session.windows.length;
      return len === 0 ? -1 : (session.activeWindowIdx + dir + len) % len;
    });
  }

  /** Status-bar ↻ reboot control — replays
   * boot from ANY window by first switching to the dashboard. Cancels a
   * stray status-bar prompt and a stray copy-mode overlay first (a
   * rename/confirm prompt would otherwise survive the switch bound to the
   * old window, and copy-mode's own z-index sits above the status bar so
   * it would occlude the freshly-replayed boot). `switchToProgram` already
   * closes a stray grep/cmdline/help-palette overlay.
   *
   * "Reboot (all triggers) = factory state + boot replay" — REPLACES
   * `client` wholesale with a fresh `createFactoryClient()` call (the exact
   * same shape the initial `$state` seed above uses) rather than merely
   * switching the EXISTING client back to the dashboard window —
   * every window/pane/program/shell buffer resets, not just the active
   * one. The signal-inbox PANEL (open/closed, queued toasts) is in-memory,
   * ephemeral UI state, closed here alongside every other overlay — the
   * persisted read/unread/archive/spam data in localStorage is untouched
   * (reboot resets the session, not the visitor's inbox history).
   * `grepRef` is closed explicitly
   * here (unlike every other window-switch entry point, which gets it for
   * free from `switchActiveWindow`'s own `closeWindowChrome()` — reboot no
   * longer routes through that helper now that it rebuilds `client`
   * directly instead of switching the old one). */
  reboot = (): void => {
    this.getStatusBarRef()?.cancelPrompt?.();
    this.getCopyModeRef()?.close?.();
    this.getCmdlineRef()?.close?.();
    this.getHelpSearchRef()?.close?.();
    this.getChooseTreeRef()?.close?.();
    this.getGrepRef()?.close?.();
    this.getNotificationsRef()?.close?.();
    this.client = createFactoryClient({
      sessionId: DEFAULT_SESSION_ID,
      sessionName: DEFAULT_SESSION_NAME,
      windows: this.site.statusBar.windows,
      epoch: resolvePageEpoch(),
      activeWindowId: "dashboard",
      hostNarrative: seedHostNarrative(this.shell, DEFAULT_SESSION_NAME),
    });
    this.syncUrl();
    this.getBootRef()?.replay();
  };

  // ---------------------------------------------------------------------
  // tmux prefix. Ctrl-b arms a 2s window during which the very next key is
  // a window-switch command instead of reaching any view. `prefixArmed`'s
  // dispatch branch is checked FIRST in handleKey() below, and the *arm*
  // check (bare Ctrl-b itself) is checked SECOND — ahead of grep
  // delegation, tmux-faithful — so the prefix works even while the grep
  // overlay is open (needed for `Ctrl-b ]`'s paste into the grep query):
  // while armed, the prefix consumes the next key before grep ever sees
  // it, exactly like every other view.
  //
  // "Ctrl-b ," / "&" / "x" / "[" / "]" — rename-window, kill-window,
  // kill-pane, copy-mode, and paste-buffer — are all dispatched from
  // `handlePrefixedKey` below alongside the digit/n/p/d/w/0 targets, since
  // they're all "the single key following an armed Ctrl-b" in exactly the
  // same way.
  // ---------------------------------------------------------------------

  prefixArmed = $state(false);
  private prefixTimer: ReturnType<typeof setTimeout> | undefined;

  armPrefix(): void {
    this.prefixArmed = true;
    clearTimeout(this.prefixTimer);
    this.prefixTimer = setTimeout(() => {
      this.prefixArmed = false;
    }, PREFIX_TIMEOUT_MS);
  }

  disarmPrefix(): void {
    this.prefixArmed = false;
    clearTimeout(this.prefixTimer);
  }

  /** The active window's own display name, for the rename prompt's
   * prefilled text and the kill-window/kill-pane confirm templates'
   * `{name}` substitution. Only ever called while attached — the rename/
   * kill-window prompts it feeds are only reachable via the tmux prefix
   * (inert while detached, see `armPrefix()`'s own gate) or a PaneTree/
   * StatusBar interaction (neither is even mounted while detached). */
  currentWindowName(): string {
    return this.activeWindow!.name;
  }

  /** Appends one system line (a `[detached (from session …)]`, `[exited]`,
   * or `logout`) directly to the HOST shell's own persistent buffer
   * (`Client.hostPane`'s own persistent buffer, survives re-attach/detach
   * cycles). These are never
   * typed commands, so they never go through shell.ts's own `runCommand` —
   * this is the one place Terminal.svelte writes into a shell buffer
   * directly. */
  appendHostLine(text: string, kind: ShellLineKind = "output"): void {
    this.client.hostPane.shell = { ...this.client.hostPane.shell, lines: [...this.client.hostPane.shell.lines, { text, kind }] };
  }

  /** Ctrl-b & (and the Builds single-pane Ctrl-b x fallback, a kill-pane
   * that emptied the last Builds panel, and shell `exit` in the last pane)
   * — routed through tmux.ts's `killWindowCascade` instead of the bare
   * `killWindow` op: killing a window that ISN'T the session's last one
   * still just removes it; killing the LAST window destroys the session
   * outright (see `killWindowCascade`'s own header comment). If that
   * cascade leaves NO session attached, the client has detached to the
   * host shell — append the exact `[exited]` line there. If another
   * session was silently switched to instead, nothing further happens
   * here (shows nothing special to the user). */
  killWindowById(id: string): void {
    this.closeWindowChrome();
    const session = this.activeSession!;
    const result = killWindowCascade(this.client, session, id);
    if (result.kind === "session-destroyed" && result.detachedToHost) {
      this.appendHostLine(this.shell.host.exitedMessage);
    }
    this.syncUrl();
  }

  /** Shell.svelte's `onLaunch` — a bare view-name command or
   * `open <view>` typed into a pane's shell: launches `program` IN THAT
   * PANE (tmux.ts's own `launchProgram`), never a window switch — any pane
   * can launch any program. `program` arrives pre-validated by shell.ts's
   * own `runCommand` (checked against `VIEW_NAMES`), so the cast is safe.
   * Syncs the URL only when the launch happened in the currently ACTIVE
   * pane — a window can have more than one pane (splits), and a launch in
   * a NON-focused pane must not push a route for content that isn't even
   * on screen. Closes grep/cmdline/palette first, unconditionally — same
   * window-chrome contract every other switch/launch/kill entry point
   * follows (`switchActiveWindow`, `exitActiveProgram`, `killWindowById`):
   * a launch changes what's on screen just as much as a window switch
   * does, so any open chrome from the PREVIOUS pane content must not
   * survive it. */
  onLaunchInPane = (paneId: string, program: string): void => {
    this.closeWindowChrome();
    launchProgram(this.activeSession!, paneId, program as ProgramName);
    if (paneId === this.activePane?.id) this.syncUrl();
  };

  /** Shell.svelte's `onExit` — the `exit` builtin ("pane shell: closes pane
   * → cascades like kill-pane"). A window can have more than one pane, so
   * this resolves `paneId`'s OWN owning window (via `windowOfPane`, never
   * assumed to be `activeWindow` — `onExit` only ever fires from the
   * FOCUSED pane in practice, but the window it lives in is found from the
   * id, not hardcoded) and either removes just that pane (more than
   * one pane in the window — `killPaneInWindow`) or falls back to the exact
   * same window-kill cascade `Ctrl-b x`'s single-pane case uses. */
  onExitPane = (paneId: string): void => {
    const session = this.activeSession!;
    const win = windowOfPane(session, paneId);
    if (!win) return; // defensive — unreachable: onExit always fires from a live pane in THIS session
    if (allPanes(win.root).length > 1) {
      this.closeWindowChrome();
      killPaneInWindow(win, paneId);
      this.syncUrl();
    } else {
      this.killWindowById(win.id);
    }
  };

  /** Site-mode `:q` / cmdline `q` — drops the ACTIVE PANE's program back to a shell in the SAME window
   * (tmux.ts's `exitProgram`); never kills the window. Distinct from
   * `onExitPane` above (Shell.svelte's own `exit` builtin, typed inside an
   * ALREADY-shell pane, which has no program left to drop and so still
   * cascades to kill-window). Closes
   * chrome first (same convention as every other window-affecting action)
   * and re-syncs the URL, which freezes in place: `programToViewId("shell")`
   * is null, so `syncUrl()` no-ops, satisfying Verify 4's "URL unchanged
   * while in shell" probe. */
  exitActiveProgram(): void {
    this.closeWindowChrome();
    exitProgram(this.activeSession!, this.activePane!.id);
    this.syncUrl();
  }

  /** Ctrl-b , — takes the target window's id as an
   * explicit argument (captured by `startRenamePrompt` at PROMPT-OPEN time)
   * rather than re-deriving it from `activeWindow` here at commit time —
   * defense in depth so this can never rename the wrong
   * window even if some future delegation change let the active window
   * drift while the prompt was still open; today's `handlePrefixedKey`
   * prompt-active gate already makes that drift impossible, but this
   * closure doesn't depend on that invariant holding elsewhere. */
  renameWindowById(id: string, name: string): void {
    renameWindowManual(this.activeSession!, id, name);
  }

  startRenamePrompt(): void {
    const id = this.activeWindow!.id;
    this.getStatusBarRef()?.startRename(this.currentWindowName(), (name) => this.renameWindowById(id, name));
  }

  startKillWindowConfirm(): void {
    const id = this.activeWindow!.id;
    const text = this.site.statusBar.prompts.killWindowTemplate.replace("{name}", this.currentWindowName());
    this.getStatusBarRef()?.startConfirm(text, () => this.killWindowById(id));
  }

  /** `Ctrl-b d` — only reachable while
   * attached (the tmux prefix never arms otherwise — see `armPrefix()`'s
   * own gate), so the non-null assertion is safe by construction. Detaches
   * the client, then appends the exact `[detached (from session {name})]`
   * line to the host shell's own persistent buffer — the SAME string its
   * own pre-seeded narrative already used once, now for a real, live
   * detach. */
  detachSession(): void {
    this.closeWindowChrome();
    const session = this.activeSession!;
    detachClient(this.client);
    this.appendHostLine(this.shell.host.detachedTemplate.replace("{name}", session.name));
  }

  // -----------------------------------------------------------------------
  // Host shell effects — Shell.svelte's
  // `onAttach`/`onCreateAndAttach`/`onAttachView`, only ever invoked from the
  // ONE host-mode Shell instance (rendered directly in the template below,
  // never through PaneTree) — a pane-mode instance's own `runCommand` never
  // emits these effects (shell.ts gates every one of them behind `mode ===
  // "host"`).
  // -----------------------------------------------------------------------

  /** `tmux a [-t name]` resolved to an existing session id by shell.ts. */
  onHostAttach = (sessionId: string): void => {
    attachSession(this.client, sessionId);
    this.syncUrl();
  };

  /** `tmux new [-s name]` — `name` already resolved/validated (non-
   * duplicate, or the next free numeric name) by shell.ts. Real tmux's own
   * "starting a new session from outside both creates and attaches". */
  onHostCreateAndAttach = (name: string): void => {
    const session = createSession(this.client, name, resolvePageEpoch());
    attachSession(this.client, session.id);
    this.syncUrl();
  };

  /** `open <view>` / `edith` in HOST mode — attaches the default session
   * and selects `view`'s window if it still exists; otherwise attaches
   * anyway (staying on whatever window that session is already on) and
   * surfaces a transient status-bar message for a window that's since
   * been killed. */
  onHostAttachView = async (sessionId: string, view: string, windowExists: boolean): Promise<void> => {
    const session = this.client.sessions.find((s) => s.id === sessionId);
    if (!session) return; // defensive — shell.ts already checked this session exists
    attachSession(this.client, sessionId);
    if (windowExists) {
      const idx = session.windows.findIndex((w) => w.id === view);
      if (idx !== -1) selectWindowIndex(session, idx);
    } else {
      // `statusBarRef` is still null here — StatusBar was UNMOUNTED (we were
      // detached) and Svelte hasn't re-rendered the `{#if activeSession}`
      // branch yet within this same synchronous tick, so `bind:this` hasn't
      // fired. `tick()` flushes that pending render before the message is
      // shown, so it actually lands on the StatusBar that just mounted
      // rather than silently no-op'ing through the `?.`.
      await tick();
      this.getStatusBarRef()?.showMessage(this.shell.host.windowGoneTemplate.replace("{view}", view).replace("{name}", session.name));
    }
    this.syncUrl();
  };

  /** Host `exit` builtin — prints
   * `logout` then reloads the page; the boot-seen sessionStorage flag is
   * untouched by a reload, so boot skips exactly like any other reload
   * (BootSequence.svelte's own gate), landing back on the factory-attached
   * default session. */
  onHostExit = (): void => {
    this.appendHostLine(this.shell.host.logoutMessage);
    window.location.reload();
  };

  /** The actual "kill the focused PANE, or the window if it's the only
   * one" ACTION (a REAL tmux pane kill, not a Builds-internal panel one) —
   * factored out so the NO-CONFIRM `Ctrl-b :` "kill-pane" tmux command can
   * call the exact same underlying behavior `Ctrl-b x`'s own confirm
   * dialog below eventually calls, without a second copy of the "which
   * pane, or fall back to kill-window" decision (single source of
   * behavior; no duplicated kill/rename logic). */
  killPaneOrWindow(): void {
    const win = this.activeWindow!;
    const paneId = this.activePane!.id;
    if (allPanes(win.root).length > 1) {
      this.closeWindowChrome();
      killPaneInWindow(win, paneId);
      this.syncUrl();
    } else {
      this.killWindowById(win.id);
    }
  }

  /** Ctrl-b x — REAL kill-pane: ALWAYS prompts `kill-pane {pane_index}?
   * (y/n)`, even on a single-pane window: destroying the last pane
   * destroys the window by cascade, no separate "fall back to kill-window
   * confirm" step. The target pane's id and its
   * `pane_index` (for the prompt text — `Window.paneOrder`'s own live-
   * renumbered position) are captured HERE, at confirm-OPEN time — same
   * "captured at prompt-open time" pattern as startRenamePrompt/
   * startKillWindowConfirm above, so a later focus change while the confirm
   * is still open can't redirect which pane actually dies. */
  startKillPaneConfirm(): void {
    const win = this.activeWindow!;
    const paneId = this.activePane!.id;
    const index = paneIndexInWindow(win, paneId);
    const text = this.site.statusBar.prompts.killPaneTemplate.replace("{pane}", String(index));
    this.getStatusBarRef()?.startConfirm(text, () => {
      if (allPanes(win.root).length > 1) {
        this.closeWindowChrome();
        killPaneInWindow(win, paneId);
        this.syncUrl();
      } else {
        this.killWindowById(win.id);
      }
    });
  }

  /** Ctrl-b ] — inserts the shared paste buffer
   * into whichever text input is currently registered (src/lib/
   * pasteTargets.ts) — the grep query, the personnel filter, the rename
   * prompt, or the editor's in-buffer search. A transient status message
   * covers both "nothing is listening" and "nothing's been yanked yet". */
  pasteFromBuffer(): void {
    const target = getActivePasteTarget();
    const buffer = getPasteBuffer();
    if (target && buffer) {
      target.insert(buffer.text);
      return;
    }
    this.getStatusBarRef()?.showMessage(this.site.statusBar.prompts.pasteEmptyMessage);
  }

  // ---------------------------------------------------------------------
  // Splits / pane nav / layouts — every one of these operates on the ACTIVE window's own tree;
  // none of them touch the URL (a split/nav/layout change never implies a
  // different WINDOW, hence never a different route — `syncUrl()` isn't
  // called from any of these, matching the "URL keyed off the active
  // WINDOW's program, not its pane arrangement" rule the rest of this file
  // already follows).
  // ---------------------------------------------------------------------

  /** `Ctrl-b |`/`%` (direction "row") and `Ctrl-b -`/`"` (direction
   * "column") — splits the active window's focused pane 50/50 with a new
   * shell pane, which becomes focused. */
  splitFocusedPane(direction: "row" | "column"): void {
    splitPane(this.activeWindow!, direction);
  }

  /** Prefix `o` — next pane, cycling `paneOrder`. */
  cycleFocusedPane(): void {
    cycleNextPane(this.activeWindow!);
  }

  /** Prefix `;` — jump back to whichever pane was focused immediately
   * before the current one (toggles back and forth on repeated presses). */
  jumpToLastPane(): void {
    focusLastPane(this.activeWindow!);
  }

  /** Prefix arrow keys — geometric directional pane nav. */
  navigateDirectional(dir: PaneDirection): void {
    focusDirectional(this.activeWindow!, dir);
  }

  /** `Ctrl-b Space` — next preset in the fidelity-verified cycle. */
  cycleLayout(): void {
    nextLayout(this.activeWindow!);
  }

  /** `select-layout <name>` / bare `select-layout` (`Ctrl-b :` tmux
   * command-prompt mode) — applies the named preset, or reapplies
   * whatever was last applied when no name is given (a silent no-op if none
   * ever was). Unknown names are reported by the caller
   * (`executeTmuxCommand` below), which already has the raw typed string. */
  applyNamedLayout(name: LayoutName | undefined): void {
    const win = this.activeWindow!;
    if (name) applyLayout(win, name);
    else reapplyLastLayout(win);
  }

  /** `Ctrl-b c` — tmux new-window: creates a
   * new window running the in-window shell program and switches focus to it
   * immediately (real tmux's own combined "create and select" behavior for
   * this binding — distinct from `createSession`'s create-only split, which
   * a SEPARATE `attachSession()` call finishes; here `selectWindowIndex` is
   * that second call, run right after `createWindow` appends it). Closes
   * window chrome first, same convention every other window-affecting
   * action follows (`switchActiveWindow`, `killWindowById`, `detachSession`)
   * — including choose-tree, which is not otherwise gated for this key
   * (same free-close treatment as the digit/n/p window-switch keys,
   * nothing to starve). `syncUrl()` no-ops for the newly-shelled
   * window exactly like `:q`'s `exitActiveProgram` does (`programToViewId
   * ("shell")` is null) — the URL freezes wherever it already was. */
  createWindowInSession(): void {
    this.closeWindowChrome();
    const session = this.activeSession;
    if (!session) return;
    createWindow(session);
    selectWindowIndex(session, session.windows.length - 1);
    this.syncUrl();
  }

  // ---------------------------------------------------------------------
  // choose-tree (`Ctrl-b w`) — ChooseTree.svelte's own callback props; every one of these is a WINDOW/
  // SESSION-level change, so each funnels through the same helpers every
  // other switch/kill path in this file already uses (switchToWindowById,
  // killWindowCascade, killSession) rather than duplicating that logic here.
  // ---------------------------------------------------------------------

  /** Enter on a WINDOW row — attaches its session first if it isn't already
   * the attached one (real tmux: choosing a window in a different session
   * switches the client to it), then selects that window. */
  chooseTreeSelectWindow = (sessionId: string, windowId: string): void => {
    if (this.client.attachedSessionId !== sessionId) attachSession(this.client, sessionId);
    const session = this.client.sessions.find((s) => s.id === sessionId);
    if (!session) return; // defensive — the row this came from only exists for a live session
    const idx = session.windows.findIndex((w) => w.id === windowId);
    if (idx !== -1) selectWindowIndex(session, idx);
    this.syncUrl();
  };

  /** Enter on a SESSION row — attaches it, staying on whichever window it
   * already had active (real tmux: no window change implied). */
  chooseTreeSelectSession = (sessionId: string): void => {
    attachSession(this.client, sessionId);
    this.syncUrl();
  };

  /** In-overlay `x` → case-insensitive `y` on a WINDOW row — reuses the
   * exact same cascade `Ctrl-b &`/`Ctrl-b x`'s single-pane fallback already
   * runs (window→session→`[exited]`), since a window dying is a window
   * dying regardless of which UI asked for it. */
  chooseTreeKillWindow = (sessionId: string, windowId: string): void => {
    const session = this.client.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const result = killWindowCascade(this.client, session, windowId);
    if (result.kind === "session-destroyed" && result.detachedToHost) {
      this.appendHostLine(this.shell.host.exitedMessage);
      // Nothing left to browse — the client is now fully detached, so
      // there's no PaneTree/StatusBar left underneath this overlay either
      // (Terminal's own `{#if activeSession}...{:else}...{/if}` branch has
      // already switched to the host shell). Close it rather than leaving
      // an empty tree floating over the host shell.
      this.getChooseTreeRef()?.close?.();
    }
    this.syncUrl();
  };

  /** In-overlay `x` → case-insensitive `y` on a SESSION row (the TYPED
   * `kill-session` command is out of scope, not this overlay action) —
   * kills every window in that session at once via tmux.ts's own
   * `killSession`. */
  chooseTreeKillSession = (sessionId: string): void => {
    const result = killSession(this.client, sessionId);
    if (result.detachedToHost) {
      this.appendHostLine(this.shell.host.exitedMessage);
      this.getChooseTreeRef()?.close?.(); // see chooseTreeKillWindow's own comment
    }
    this.syncUrl();
  };

  // ---------------------------------------------------------------------
  // Site-wide floating Cmdline — Cmdline.svelte itself
  // is dumb about execution (see that component's own header comment);
  // every side effect a `:`/`Ctrl-b :` command implies lives here, reusing
  // the exact same functions the rest of this file already uses for the
  // equivalent bound key (switchToProgram, killWindowById, killPaneOrWindow,
  // renameWindowById, reboot, grepRef, downloadResume) — single source of
  // behavior, no duplicated kill/rename logic.
  // ---------------------------------------------------------------------

  /** Forwards to the focused pane's own embedded Editor if it's actually
   * open (if any) — the ex-mode entry context always
   * tries this FIRST; only a command it doesn't recognize falls through to
   * the site-wide `commands` list below ("editor context wins"). Keyed off
   * the focused ref's own capability (same simplification as
   * killPaneOrWindow above) rather than `view === "builds"/"personnel"`
   * identity — only those two ever export `runEditorExCommand`. */
  runEditorExCommand(cmd: string): { recognized: boolean; error?: string } {
    return this.getFocusedRef()?.runEditorExCommand?.(cmd) ?? { recognized: false };
  }

  formatUnknownCommand(cmd: string): string {
    return this.cmdlineData.errors.unknownCommandTemplate.replace("{cmd}", cmd);
  }

  /** Executes a resolved `cmdline.yaml` `commands[]` entry by its `action`
   * id — shared by both the "site" and "ex" entry contexts.
   * Returns an error string on failure, `undefined` on success (the box
   * closes itself whenever this returns nothing, same convention as the
   * `onSubmit` prop it's called from). */
  executeSiteAction(action: string | undefined, args: string): string | undefined {
    switch (action) {
      case "view:home":
        this.switchToProgram("dashboard");
        return undefined;
      case "view:builds":
        this.switchToProgram("builds");
        return undefined;
      case "view:personnel":
        this.switchToProgram("personnel");
        return undefined;
      case "view:profile":
        this.switchToProgram("profile");
        return undefined;
      case "view:retina-v":
        this.switchToProgram("retina-v");
        return undefined;
      case "view:help":
        this.switchToProgram("help");
        return undefined;
      case "grep":
        this.getGrepRef()?.openWithQuery?.(args);
        return undefined;
      case "reboot":
        this.reboot();
        return undefined;
      case "resume":
        downloadResume();
        return undefined;
      case "exit-program":
        // Site-mode `:q` / cmdline `q`: exits the
        // active pane's program to a shell — never kills the window, no
        // last-window guard to apply (see exitActiveProgram()'s own doc).
        this.exitActiveProgram();
        return undefined;
      default:
        return undefined;
    }
  }

  /** Resolves `trimmed` against the site-wide `commands` list and runs it,
   * or reports E492 if nothing matches — the shared tail of both "site"
   * mode and ex mode's own fallback (the unknown-command template, reused
   * verbatim for every context, not just an open editor's — see
   * cmdline.yaml's own `errors.unknownCommandTemplate` comment). */
  executeSiteOrUnknown(trimmed: string): string | undefined {
    const { name, args } = parseInput(trimmed);
    const def = resolveCommand(this.cmdlineData.commands, name);
    if (def) return this.executeSiteAction(def.action, args);
    return this.formatUnknownCommand(trimmed);
  }

  /** `Ctrl-b :` tmux command-prompt mode — parses and
   * dispatches `rename-window <name>` / `kill-window` / `kill-pane` /
   * `select-window <0-5>` through the exact functions the bound keys
   * (`,` / `&` / `x` / digit targets) already use, minus their interactive
   * confirm step: a typed command is already deliberate, exactly like
   * `:q` bypassing the bare-key q/Esc ban — real
   * tmux's own command-prompt doesn't re-confirm `:kill-window` either
   * (only the `&` KEY binding is wrapped in `confirm-before`). */
  executeTmuxCommand(trimmed: string): string | undefined {
    const parsed = parseTmuxCommand(trimmed);
    if (parsed.kind === "rename-window") {
      this.renameWindowById(this.activeWindow!.id, parsed.name);
      return undefined;
    }
    if (parsed.kind === "kill-window") {
      this.killWindowById(this.activeWindow!.id);
      return undefined;
    }
    if (parsed.kind === "kill-pane") {
      this.killPaneOrWindow();
      return undefined;
    }
    if (parsed.kind === "select-window") {
      if (parsed.index === 0) {
        this.switchToProgram("dashboard");
        return undefined;
      }
      const target = this.prefixTargets[String(parsed.index)];
      if (!target) return this.cmdlineData.errors.noSuchWindowTemplate.replace("{arg}", String(parsed.index));
      this.switchToWindowById(target);
      return undefined;
    }
    if (parsed.kind === "select-layout") {
      this.applyNamedLayout(parsed.name);
      return undefined;
    }
    if (parsed.kind === "select-layout-unknown") {
      return this.cmdlineData.errors.unknownLayoutTemplate.replace("{name}", parsed.name);
    }
    if (parsed.kind === "usage") {
      return parsed.command === "rename-window" ? this.cmdlineData.errors.usageRenameWindow : this.cmdlineData.errors.usageSelectWindow;
    }
    return this.formatUnknownCommand(trimmed);
  }

  /** Cmdline.svelte's `onSubmit` prop — the single entry point for every
   * `:`/`Ctrl-b :` command's actual side effect (see this section's own
   * header comment). */
  onCmdlineSubmit = (mode: CmdlineMode, raw: string): string | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") return undefined;

    if (mode === "tmux") return this.executeTmuxCommand(trimmed);

    if (mode === "ex") {
      const result = this.runEditorExCommand(trimmed);
      if (result.recognized) return result.error;
      // Not an editor ex command — fall through to the site-wide set too.
    }

    return this.executeSiteOrUnknown(trimmed);
  };

  /** HelpSearch.svelte's `onExecute` prop — Enter on a command row there
   * runs through the exact same
   * executeSiteAction switch every `:` command already does, with no typed
   * args (the palette's own typed text is a search query, never passed
   * through as a command argument). HelpSearch.svelte closes itself right
   * after calling this — this function only ever performs the action's own
   * side effect, same "dumb about presentation" split as onCmdlineSubmit. */
  onHelpSearchExecute = (action: string | undefined): void => {
    this.executeSiteAction(action, "");
  };
}
