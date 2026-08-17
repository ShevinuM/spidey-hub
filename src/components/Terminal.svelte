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
  } from "../lib/data";
  import type { Commit } from "../lib/commits";
  import type { ViewId } from "../lib/views";
  import { VIEW_ROUTES, hotkeyToView, pathToView } from "../lib/views";
  import Wallpaper from "./Wallpaper.svelte";
  import StatusBar from "./StatusBar.svelte";
  import Dashboard from "./Dashboard.svelte";
  import Toasts from "./Toasts.svelte";
  import TrackerView from "./TrackerView.svelte";
  import Builds from "./Builds.svelte";
  import Personnel from "./Personnel.svelte";

  interface Props {
    initialView: ViewId;
    site: SiteData;
    dashboard: DashboardData;
    tracker: TrackerData;
    profile: ProfileData;
    builds: BuildsData;
    personnel: PersonnelData;
    companies: CompanyEntry[];
    projects: CollectionEntry<"projects">[];
    personnelEntries: CollectionEntry<"personnel">[];
    commitsByRepo: Record<string, Commit[]>;
  }

  const { initialView, site, dashboard, tracker, builds, personnel, companies, projects, personnelEntries, commitsByRepo }: Props =
    $props();

  /** Set by Builds.svelte's `bind:this` while `view === "builds"` — see
   * handleKey() below for the delegation contract (PLAN.md Phase 5). */
  let buildsRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);
  /** Same `bind:this` + `handleKey(): boolean` contract, one level down —
   * Personnel.svelte's own embedded Editor (PLAN.md Phase 6). */
  let personnelRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

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

  function handleKey(e: KeyboardEvent) {
    // `/` is reserved for the grep overlay (Phase 8). Until then it must
    // not type or scroll, but it is also not a view switch. Checked before
    // the modifier-fall-through below so it can run before Ctrl-d/Ctrl-u are
    // carved out — but only a plain, unmodified "/" is claimed here; Cmd+/,
    // Ctrl+/ etc. must still fall through untouched (`e.key` is "/"
    // regardless of which modifiers are held, so this needs its own guard
    // rather than relying on the later blanket modifier check).
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
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
      <!-- Profile: Phase 7. -->
      <div style="flex:1;min-height:0"></div>
    {/if}

    <StatusBar {site} {view} />
  </div>
</div>
