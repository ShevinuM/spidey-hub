<script lang="ts">
  // Harness-only wrapper: mounts GrepOverlay.svelte alone and reproduces
  // Terminal.svelte's global keydown delegation into its exported
  // handleKey(), mirroring RepositoriesHarness.svelte/NotificationsHarness.svelte.

  // `onNavigate` is a no-op here, so Enter on a hit still closes the
  // overlay but never changes a view — assertions here check only closing.
  import { onMount } from "svelte";
  import GrepOverlay from "../../../components/GrepOverlay.svelte";
  import type { GrepData } from "../../../../../common/lib/data";

  interface Props {
    grep: GrepData;
  }

  const { grep }: Props = $props();

  let ref = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** True only once hydration completes — `onMount` only runs client-side,
   * so a spec pressing "/" right after navigation can't race the window
   * listener attaching. */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });

  function handleKey(e: KeyboardEvent) {
    ref?.handleKey(e);
  }
</script>

<svelte:window onkeydown={handleKey} />

<GrepOverlay bind:this={ref} {grep} onNavigate={() => {}} />
<div data-testid="grep-harness-ready" data-ready={ready}></div>
