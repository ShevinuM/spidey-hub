<script lang="ts">
  // Synthetic props stand in for the live tmux state (`isFocused`/
  // `windowNumbers`/`paneCount`/`onSelect`) that Terminal.svelte/
  // PaneTree.svelte own in the real app; `windowNumbers` mirrors the real
  // window-id mapping so the hotkey column renders true bindings instead of
  // blank cells.
  import { onMount } from "svelte";
  import Dashboard from "../../../components/Dashboard.svelte";
  import type { DashboardData } from "../../../../../common/lib/data";

  interface Props {
    dashboard: DashboardData;
  }

  const { dashboard }: Props = $props();

  const WINDOW_NUMBERS: Record<string, number> = {
    dashboard: 0,
    repositories: 1,
    employment: 2,
    "retina-v": 3,
    profile: 4,
    help: 5,
  };

  /** True only once hydration has actually run; `onMount` fires client-side after mount, so a spec can wait on this rather than pass on pre-hydration SSR markup alone. */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
</script>

<Dashboard {dashboard} isFocused={true} windowNumbers={WINDOW_NUMBERS} paneCount={6} onSelect={() => {}} />
<div data-testid="dashboard-harness-ready" data-ready={ready}></div>
