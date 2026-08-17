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
  } from "../lib/data";
  import type { Commit } from "../lib/commits";
  import type { ViewId } from "../lib/views";
  import { VIEW_ROUTES, activeWindowId, hotkeyToView, pathToView } from "../lib/views";
  import Wallpaper from "./Wallpaper.svelte";
  import StatusBar from "./StatusBar.svelte";
  import Dashboard from "./Dashboard.svelte";
  import Toasts from "./Toasts.svelte";
  import TrackerView from "./TrackerView.svelte";
  import Builds from "./Builds.svelte";
  import Personnel from "./Personnel.svelte";
  import Profile from "./Profile.svelte";
  import GrepOverlay from "./GrepOverlay.svelte";

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
    projects,
    personnelEntries,
    commitsByRepo,
  }: Props = $props();

  /** Set by Builds.svelte's `bind:this` while `view === "builds"` — see
   * handleKey() below for the delegation contract (PLAN.md Phase 5). */
  let buildsRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);
  /** Same `bind:this` + `handleKey(): boolean` contract, one level down —
   * Personnel.svelte's own embedded Editor (PLAN.md Phase 6). */
  let personnelRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);
  /** Same contract again — Profile.svelte only ever claims `r` (resume
   * download); everything else (including q/Esc) falls through to the
   * generic handling below (PLAN.md Phase 7). */
  let profileRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);
  /** GrepOverlay.svelte (PLAN.md Phase 8) — always mounted (see that file's
   * header comment), consulted FIRST on every keydown, ahead of every other
   * ref above: this is what makes "/" open the overlay from inside an
   * editor, and what keeps the overlay's own keys (typing, nav, Enter/Esc)
   * from ever reaching the view underneath while it's open. */
  let grepRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

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

  function setView(next: ViewId) {
    if (next === view) return;
    view = next;
    history.pushState(null, "", VIEW_ROUTES[next]);
  }

  // ---------------------------------------------------------------------
  // tmux prefix (PLAN.md Phase 9 / README keymap, "Stated assumptions").
  // Ctrl-b arms a 2s window during which the very next key is a
  // window-switch command instead of reaching any view. `prefixArmed`'s
  // dispatch branch is checked FIRST in handleKey() below — even before
  // the grep delegation — so a prefixed key (including a bare "/") can
  // never leak into any view handler OR open the grep overlay; only the
  // *arm* check (bare Ctrl-b itself) runs after grep delegation, per the
  // inherited fact that grep must keep swallowing Ctrl-b while open (its
  // own "unrecognized modifier combo" branch — see GrepOverlay.svelte —
  // already returns `true` for it unconditionally while open, so Ctrl-b
  // can never arm the prefix while the overlay is up; armed ∧ grep-open is
  // therefore unreachable: grep only ever opens via a bare "/", and a
  // prefixed "/" is now swallowed by the armed-dispatch branch below
  // before grep ever sees it).
  // ---------------------------------------------------------------------
  const PREFIX_CYCLE: ViewId[] = ["builds", "personnel", "retina-v", "profile"];
  const PREFIX_TARGETS: Partial<Record<string, ViewId>> = {
    "1": "builds",
    "2": "personnel",
    "3": "retina-v",
    "4": "profile",
  };
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

  /** n/p — next/prev window. `home` (dashboard) has no window of its own;
   * treated as sitting at `activeWindowId`'s existing home->builds mapping
   * (StatusBar/views.ts convention) so n/p from the dashboard still land
   * somewhere sensible. Untested directly (the e2e cycle test starts from
   * "builds", where the choice isn't load-bearing) — documented here for
   * whoever next touches it. */
  function cyclePrefixView(dir: 1 | -1) {
    const current = activeWindowId(view) as ViewId;
    const idx = PREFIX_CYCLE.indexOf(current);
    const base = idx === -1 ? 0 : idx;
    const next = PREFIX_CYCLE[(base + dir + PREFIX_CYCLE.length) % PREFIX_CYCLE.length];
    setView(next);
  }

  /** The single key following an armed Ctrl-b. Always disarms. A held
   * modifier (e.g. Ctrl-d) is deliberately NOT treated as a prefix command
   * — disarm and fall through to the rest of handleKey unchanged, so e.g.
   * the Builds/Personnel editor's own Ctrl-d/Ctrl-u half-page scroll still
   * works immediately after an (unused) Ctrl-b, and the global "modifier
   * combos fall through untouched" rule holds even mid-prefix. */
  function handlePrefixedKey(e: KeyboardEvent): boolean {
    disarmPrefix();
    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (e.key === "Escape") return true; // cancel — swallowed, no action

    const target = PREFIX_TARGETS[e.key];
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

    // Unrecognized prefixed key — tmux swallows it silently (no action);
    // only preventDefault a printable character (mirrors GrepOverlay's own
    // "swallow printable, let modifiers through" split).
    if (e.key.length === 1) e.preventDefault();
    return true;
  }

  function handleKey(e: KeyboardEvent) {
    if (prefixArmed) {
      if (handlePrefixedKey(e)) return;
      // A modifier combo mid-prefix: disarmed above, deliberately falls
      // through to grep/view handling below as if no prefix were armed.
    }

    // GrepOverlay.svelte owns "/" (open) and every key while it's already
    // open — consulted before anything else, exactly mirroring the
    // prototype's own dispatch order (Homepage.dc.html line 980:
    // `if (this.state.grep) { this.grepKey(e); return; }` runs before even
    // the bare-"/" check, which itself runs before any view-specific
    // handling). GrepOverlay.handleKey() calls e.preventDefault() itself
    // exactly where the prototype's grepKey() does (see that file's header
    // comment) — never here — so an unrecognized modifier combo held while
    // the overlay is open (e.g. Cmd+L) still reaches the browser, it just
    // never reaches buildsRef/personnelRef/profileRef or the view-switch
    // keys below.
    if (grepRef?.handleKey(e)) {
      return;
    }

    // Ctrl-b arms the tmux prefix (PLAN.md Phase 9) — checked AFTER grep
    // delegation so grep's own dispatch (when open) keeps swallowing it via
    // its "unrecognized modifier combo" branch, exactly like every other
    // Ctrl/Cmd/Alt chord while the overlay is up. Only Ctrl-b itself is
    // preventDefault-ed (global keymap rule: every other modifier combo
    // falls through untouched) — pressing it again while already armed
    // simply re-arms (resets the 2s window).
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      armPrefix();
      return;
    }

    // Ctrl-d/Ctrl-u are reserved for the Builds/Personnel file editors'
    // half-page scroll (PLAN.md Phase 5 "Editor scrolling", inherited by
    // Phase 6's personnel role editor) — the one deliberate exception to
    // "modifier combos fall through untouched" so far (Phase 9 adds
    // Ctrl-b/tmux-prefix and Phase 8 adds grep's own Ctrl chords the same
    // way: carved out here, everything else still falls through).
    const isEditorScrollChord =
      e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "d" || e.key === "D" || e.key === "u" || e.key === "U");

    if (view === "builds" && buildsRef && (isEditorScrollChord || !(e.metaKey || e.ctrlKey || e.altKey))) {
      if (buildsRef.handleKey(e)) {
        e.preventDefault();
        return;
      }
    }

    if (view === "personnel" && personnelRef && (isEditorScrollChord || !(e.metaKey || e.ctrlKey || e.altKey))) {
      if (personnelRef.handleKey(e)) {
        e.preventDefault();
        return;
      }
    }

    if (view === "profile" && profileRef && !(e.metaKey || e.ctrlKey || e.altKey)) {
      if (profileRef.handleKey(e)) {
        e.preventDefault();
        return;
      }
    }

    // Modifier combos fall through untouched — never preventDefault them,
    // regardless of which view is active (PLAN.md keymap: "modifier-held
    // keys fall through untouched").
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key.toLowerCase();

    if (view !== "home") {
      if (k === "q" || e.key === "Escape") setView("home");
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
      <!-- Full-opacity wallpaper (handled by Wallpaper's `view` prop) plus
           the dismissible back pill. -->
      <TrackerView {tracker} onGoHome={() => setView("home")} />
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
    {:else}
      <Profile bind:this={profileRef} {profile} onGoHome={() => setView("home")} />
    {/if}

    <StatusBar {site} {view} />
  </div>

  <GrepOverlay bind:this={grepRef} {grep} onNavigate={setView} />
</div>
