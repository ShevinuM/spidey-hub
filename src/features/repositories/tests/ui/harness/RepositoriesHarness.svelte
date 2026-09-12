<script lang="ts">
  // Harness-only wrapper: mounts Repositories.svelte alone, reproducing just
  // the one piece of cross-component routing Terminal.svelte normally owns
  // — PaneTree.svelte's shared `refs` map keydown delegation
  // (`if (ref.handleKey(e)) return`). Repositories.svelte itself attaches no
  // listener of its own; it only exports `handleKey()`, `isEditorOpen()` and
  // `runEditorExCommand()`. Mirrors the shape NotificationsHarness.svelte/
  // EmploymentHarness.svelte already reimplement for the same
  // "exports handleKey, attaches nothing" shape. `isEditorOpen()`/
  // `runEditorExCommand()` are Terminal's ex-mode delegation contract
  // (Cmdline box routing `:`-commands into an open editor) — this harness
  // has no Cmdline box to route through, so only the keydown piece is
  // reproduced here.
  //
  // Lives beside its own harness spec (not in this feature's real
  // `components/` tree) since it exists only to let the harness route mount
  // this one piece with Terminal's routing reproduced — it is test support,
  // not production UI.
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

  /** True only once this island has actually hydrated — same race
   * NotificationsHarness.svelte's/EmploymentHarness.svelte's own `ready`
   * flags guard against: the server-rendered HTML (repo list, files tree,
   * preview, commits, status panel) is present before `client:load`'s JS
   * runs, so a spec pressing a key immediately after navigation would
   * otherwise race `<svelte:window>`'s listener attaching. `onMount` only
   * ever runs client-side, after mount, so this flips exactly once
   * hydration is done. */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });

  function handleKey(e: KeyboardEvent) {
    ref?.handleKey(e);
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- `isFocused: true` — the only mounted instance, so it IS the focused
     one. In the real app this comes from PaneTree.svelte's multi-instance
     focus tracking, which a kernel-free harness excludes. -->
<Repositories bind:this={ref} {repositories} {projects} {commitsByRepo} isFocused={true} />
<div data-testid="repositories-harness-ready" data-ready={ready}></div>
