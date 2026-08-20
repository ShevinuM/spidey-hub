<script lang="ts">
  // Recursive pane-tree renderer — replaces Terminal.svelte's old
  // `{#if view === "home"}...{:else if ...}` chain. A "split" node renders
  // a flex row/column of its children (each sized by its parallel `sizes`
  // fraction), recursing into itself via `<svelte:self>` for each child.
  //
  // Ref registry ("per-pane ref Map for delegation"): `refs` is a PROP, not
  // a component-local Map — Terminal.svelte creates it ONCE (imperative,
  // non-$state — it's consulted on keydown, never rendered through a
  // template) and threads the SAME object down through every recursive
  // `<svelte:self>` call, so every leaf anywhere in the tree registers into
  // ONE shared map regardless of nesting depth. A fresh Map per component
  // instance would only work when exactly one leaf instance ever exists;
  // once the root becomes a split node, every leaf lives in a CHILD
  // instance, so a component-local map would silently fragment the
  // registry across instances.
  //
  // `activePaneId` is threaded down alongside `refs` for two things: (1)
  // each leaf knows whether IT is the focused one (`isFocused`), gating its
  // own data-copy-source/paste-target registration so exactly one mounted
  // instance of a multi-instance program (any pane can run any program,
  // even one already running elsewhere) ever claims either; (2) the
  // active-pane border accent below, which only ever renders around the
  // ACTUAL active leaf — never shown at all on a single-pane window
  // (`multiPane` gate), matching real tmux's own "no border to speak of
  // with only one pane".
  import type { ProgramName, PaneNode } from "../lib/tmux";
  import type {
    DashboardData,
    RepositoriesData,
    PersonnelData,
    ProfileData,
    HelpData,
    ShellData,
    CommandLogLine,
  } from "../lib/data";
  import type { CollectionEntry } from "astro:content";
  import type { Commit } from "../lib/commits";
  import type { SessionRosterEntry, ShellMode } from "../lib/shell";
  import Dashboard from "./Dashboard.svelte";
  import Repositories from "./repositories/Repositories.svelte";
  import EmploymentRecords from "./employment-records/EmploymentRecords.svelte";
  import Profile from "./Profile.svelte";
  import HelpView from "./HelpView.svelte";
  import Shell from "./Shell.svelte";
  import { viewIdToProgram } from "../lib/views";

  interface Props {
    node: PaneNode;
    /** The WINDOW's currently-focused pane id — same value at every
     * recursion depth, just compared against each leaf's own pane id to
     * compute that leaf's `isFocused`. */
    activePaneId: string;
    /** True once the window has more than one pane — gates the active-pane
     * border accent (see file header). */
    multiPane: boolean;
    /** Shared, non-reactive ref registry — see file header. Only ever
     * `.set`/`.delete`'d from a leaf's own `$effect`; Terminal.svelte reads
     * it directly (`refs.get(activePaneId)`), never through this
     * component's exports. */
    refs: Map<string, unknown>;
    dashboard: DashboardData;
    /** Window id (a `ProgramName`) -> its live tmux window number — threaded
     * straight through to Dashboard.svelte's own hotkey-column lookup. */
    windowNumberById: Record<string, number>;
    /** Live total pane count across the whole session — threaded straight
     * through to Dashboard.svelte's footer sync line. */
    paneCount: number;
    repositories: RepositoriesData;
    repositoriesFixtureMode: boolean;
    personnel: PersonnelData;
    profile: ProfileData;
    help: HelpData;
    shell: ShellData;
    projects: CollectionEntry<"repositories">[];
    personnelEntries: CollectionEntry<"personnel">[];
    commitsByRepo: Record<string, Commit[]>;
    commandLog: CommandLogLine[];
    /** Dashboard menu clicks / EmploymentRecords's "onDashboard" are all just
     * "switch to a different WINDOW" (exactly like a status-bar click or a
     * prefix digit target) — never a program LAUNCH into the current pane —
     * so they all funnel through this one callback, keyed by the target
     * window's canonical program id. */
    onWindowSwitch: (program: ProgramName) => void;
    /** Shell.svelte's own three effects — launching a program IN THIS PANE
     * (bare view-name commands/
     * `open <view>`, never a window switch), exiting THIS pane's program
     * back to a shell (`exit` — cascades like kill-pane), and `reboot`. */
    onLaunchInPane: (paneId: string, program: string) => void;
    onExitPane: (paneId: string) => void;
    onReboot: () => void;
    shellMode: ShellMode;
    viewNames: readonly string[];
    shellSession: { name: string; windowCount: number; createdAt: number; attached: boolean };
    /** Forwarded straight through to every in-pane Shell instance so
     * `tmux ls` (which lists
     * every session, not just this one) works from a pane too, not only the
     * host shell — see Shell.svelte's own prop doc comment. */
    sessions: SessionRosterEntry[];
    defaultSessionName: string;
  }

  const {
    node,
    activePaneId,
    multiPane,
    refs,
    dashboard,
    windowNumberById,
    paneCount,
    repositories,
    repositoriesFixtureMode,
    personnel,
    profile,
    help,
    shell,
    projects,
    personnelEntries,
    commitsByRepo,
    commandLog,
    onWindowSwitch,
    onLaunchInPane,
    onExitPane,
    onReboot,
    shellMode,
    viewNames,
    shellSession,
    sessions,
    defaultSessionName,
  }: Props = $props();

  let leafRef = $state<unknown>(null);

  $effect(() => {
    if (node.type !== "leaf") return;
    const id = node.pane.id;
    if (leafRef) refs.set(id, leafRef);
    else refs.delete(id);
    return () => {
      refs.delete(id);
    };
  });

  const isFocused = $derived(node.type === "leaf" && node.pane.id === activePaneId);
</script>

{#if node.type === "split"}
  <div style="flex:1;min-height:0;min-width:0;display:flex;flex-direction:{node.direction === 'row' ? 'row' : 'column'}">
    {#each node.children as child, i (i)}
      <div
        style="flex:{node.sizes[i] ?? 1} 1 0%;min-width:0;min-height:0;display:flex;flex-direction:column;{i > 0
          ? node.direction === 'row'
            ? 'border-left:1px solid rgba(196,216,232,.18)'
            : 'border-top:1px solid rgba(196,216,232,.18)'
          : ''}"
      >
        <svelte:self
          node={child}
          {activePaneId}
          {multiPane}
          {refs}
          {dashboard}
          {windowNumberById}
          {paneCount}
          {repositories}
          {repositoriesFixtureMode}
          {personnel}
          {profile}
          {help}
          {shell}
          {projects}
          {personnelEntries}
          {commitsByRepo}
          {commandLog}
          {onWindowSwitch}
          {onLaunchInPane}
          {onExitPane}
          {onReboot}
          {shellMode}
          {viewNames}
          {shellSession}
          {sessions}
          {defaultSessionName}
        />
      </div>
    {/each}
  </div>
{:else}
  <div
    data-testid="pane-leaf"
    data-pane-focused={isFocused}
    style="flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;{multiPane && isFocused
      ? 'box-shadow:inset 0 0 0 1px #e0453c'
      : ''}"
  >
    {#if node.pane.program === "dashboard"}
      <Dashboard {dashboard} {isFocused} windowNumbers={windowNumberById} {paneCount} onSelect={(v) => onWindowSwitch(viewIdToProgram(v))} />
    {:else if node.pane.program === "retina-v"}
      <!-- The full-opacity map/HUD is Wallpaper's own view-gated opacity
           (rendered once, behind every window, by Terminal.svelte) — this
           branch is otherwise empty. The filler
           div keeps the flex column's layout identical to every other
           window (StatusBar still pinned to the bottom). -->
      <div style="flex:1;min-height:0"></div>
    {:else if node.pane.program === "repositories"}
      <Repositories
        bind:this={leafRef}
        {repositories}
        {projects}
        {commitsByRepo}
        {commandLog}
        {isFocused}
        fixtureMode={repositoriesFixtureMode}
      />
    {:else if node.pane.program === "employment"}
      <EmploymentRecords
        bind:this={leafRef}
        {personnel}
        {personnelEntries}
        {isFocused}
        fixtureMode={repositoriesFixtureMode}
      />
    {:else if node.pane.program === "help"}
      <HelpView bind:this={leafRef} {help} {isFocused} />
    {:else if node.pane.program === "profile"}
      <Profile bind:this={leafRef} {profile} {isFocused} />
    {:else}
      <!-- program === "shell". -->
      <Shell
        bind:this={leafRef}
        {shell}
        pane={node.pane}
        mode={shellMode}
        {viewNames}
        session={shellSession}
        {sessions}
        {defaultSessionName}
        {isFocused}
        onLaunch={(program) => onLaunchInPane(node.pane.id, program)}
        onExit={() => onExitPane(node.pane.id)}
        {onReboot}
      />
    {/if}
  </div>
{/if}
