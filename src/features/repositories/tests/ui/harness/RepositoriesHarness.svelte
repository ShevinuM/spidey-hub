<script lang="ts">
  // Reproduces just PaneTree.svelte's keydown delegation (the only cross-component routing Repositories.svelte needs) since it exports `handleKey()` but attaches no listener itself.
  import { onMount } from "svelte";
  import Repositories from "../../../components/Repositories.svelte";
  import type { RepositoriesData } from "../../../../../common/lib/data";
  import type { Commit } from "../../../../../common/lib/commits";
  import type { CollectionEntry } from "astro:content";

  interface Props {
    repositories: RepositoriesData;
    projects: CollectionEntry<"repositories">[];
    commitsByRepo: Record<string, Commit[]>;
  }

  const { repositories, projects, commitsByRepo }: Props = $props();

  let ref = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** Flips true once this island hydrates (via onMount, client-only) so a spec doesn't press a key before `<svelte:window>`'s listener attaches. */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });

  function handleKey(e: KeyboardEvent) {
    ref?.handleKey(e);
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- The only mounted instance is always the focused one; a real kernel would derive this from PaneTree's multi-instance tracking. -->
<Repositories bind:this={ref} {repositories} {projects} {commitsByRepo} isFocused={true} />
<div data-testid="repositories-harness-ready" data-ready={ready}></div>
