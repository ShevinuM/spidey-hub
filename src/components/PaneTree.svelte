<script lang="ts">
  // Recursive pane-tree renderer (PLAN.md Iteration 3 Phase 4 item 4.1) —
  // replaces Terminal.svelte's old `{#if view === "home"}...{:else if ...}`
  // chain. Phase 4 only ever has ONE leaf per window (the "single-leaf fast
  // path" the plan calls for), so this file today is a leaf renderer in
  // spirit; it's shaped as a real recursive component from the start so
  // Phase 6's split nodes (a second `PaneNode` variant — see tmux.ts's own
  // comment) only need a new `{:else if node.type === "split"}` branch here
  // that renders <PaneTree> again for each child, rather than a rewrite.
  //
  // Owns the per-pane ref registry Terminal.svelte delegates keyboard
  // handling through (PLAN.md "per-pane ref Map for delegation"): every
  // mounted program component's `bind:this` lands in a local, non-reactive
  // `Map<paneId, ref>` (deliberately NOT `$state` — it's an imperative
  // registry consulted on keydown, never rendered; wrapping it in `$state`
  // would just be reactivity Terminal.svelte never reads through a template)
  // kept in sync by a small `$effect` per leaf. Phase 4 only ever populates
  // one entry (this component only ever renders one leaf at a time), but the
  // shape already supports Phase 6 mounting several leaves concurrently
  // (each leaf's own `$effect` independently owns its own map entry).
  import type { ProgramName, PaneNode } from "../lib/tmux";
  import type {
    DashboardData,
    BuildsData,
    PersonnelData,
    ProfileData,
    HelpData,
    ShellData,
    CompanyEntry,
  } from "../lib/data";
  import type { CollectionEntry } from "astro:content";
  import type { Commit } from "../lib/commits";
  import type { SessionRosterEntry, ShellMode } from "../lib/shell";
  import Dashboard from "./Dashboard.svelte";
  import Builds from "./Builds.svelte";
  import Personnel from "./Personnel.svelte";
  import Profile from "./Profile.svelte";
  import HelpView from "./HelpView.svelte";
  import Shell from "./Shell.svelte";
  import { viewIdToProgram } from "../lib/views";

  interface Props {
    node: PaneNode;
    dashboard: DashboardData;
    builds: BuildsData;
    personnel: PersonnelData;
    profile: ProfileData;
    help: HelpData;
    shell: ShellData;
    companies: CompanyEntry[];
    projects: CollectionEntry<"projects">[];
    personnelEntries: CollectionEntry<"personnel">[];
    commitsByRepo: Record<string, Commit[]>;
    /** Dashboard menu clicks / Builds' "onTracker" / Personnel's
     * "onDashboard" are all just "switch to a different WINDOW" (exactly
     * like a status-bar click or a prefix digit target) — never a program
     * LAUNCH into the current pane — so they all funnel through this one
     * callback, keyed by the target window's canonical program id. */
    onWindowSwitch: (program: ProgramName) => void;
    /** Shell.svelte's own three effects (PLAN.md Iteration 3 Phase 4 item
     * 4.2/4.3) — launching a program IN THIS PANE (bare view-name commands/
     * `open <view>`, never a window switch), exiting THIS pane's program
     * back to a shell (`exit` — cascades like kill-pane), and `reboot`. */
    onLaunchInPane: (paneId: string, program: string) => void;
    onExitPane: (paneId: string) => void;
    onReboot: () => void;
    shellMode: ShellMode;
    viewNames: readonly string[];
    shellSession: { name: string; windowCount: number; createdAt: number; attached: boolean };
    /** PLAN.md Iteration 3 Phase 5 items 5.2/5.3 — forwarded straight
     * through to every in-pane Shell instance so `tmux ls` (which lists
     * every session, not just this one) works from a pane too, not only the
     * host shell — see Shell.svelte's own prop doc comment. */
    sessions: SessionRosterEntry[];
    defaultSessionName: string;
  }

  const {
    node,
    dashboard,
    builds,
    personnel,
    profile,
    help,
    shell,
    companies,
    projects,
    personnelEntries,
    commitsByRepo,
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

  const refs = new Map<string, unknown>();

  /** Terminal.svelte's delegation lookup — returns whichever ref (if any) is
   * currently registered for `paneId`. Undefined for a pane that isn't
   * mounted (not this phase's concern — every window has exactly one pane
   * and only the ACTIVE window's tree is ever rendered) or whose mounted
   * component doesn't export a ref at all (Dashboard, retina-v). */
  export function getRef(paneId: string): unknown {
    return refs.get(paneId);
  }

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
</script>

{#if node.type === "leaf"}
  {#if node.pane.program === "dashboard"}
    <Dashboard {dashboard} onSelect={(v) => onWindowSwitch(viewIdToProgram(v))} />
  {:else if node.pane.program === "retina-v"}
    <!-- The full-opacity map/HUD is Wallpaper's own view-gated opacity
         (rendered once, behind every window, by Terminal.svelte) — this
         branch is otherwise empty (PLAN.md Phase 1 items 15/16). The filler
         div keeps the flex column's layout identical to every other
         window (StatusBar still pinned to the bottom). -->
    <div style="flex:1;min-height:0"></div>
  {:else if node.pane.program === "builds"}
    <Builds bind:this={leafRef} {builds} {projects} {commitsByRepo} onTracker={() => onWindowSwitch("retina-v")} />
  {:else if node.pane.program === "personnel"}
    <Personnel
      bind:this={leafRef}
      {personnel}
      {companies}
      {personnelEntries}
      onDashboard={() => onWindowSwitch("dashboard")}
    />
  {:else if node.pane.program === "help"}
    <HelpView bind:this={leafRef} {help} />
  {:else if node.pane.program === "profile"}
    <Profile bind:this={leafRef} {profile} />
  {:else}
    <!-- program === "shell" (PLAN.md Iteration 3 Phase 4 item 4.2). -->
    <Shell
      bind:this={leafRef}
      {shell}
      pane={node.pane}
      mode={shellMode}
      {viewNames}
      session={shellSession}
      {sessions}
      {defaultSessionName}
      onLaunch={(program) => onLaunchInPane(node.pane.id, program)}
      onExit={() => onExitPane(node.pane.id)}
      {onReboot}
    />
  {/if}
{/if}
