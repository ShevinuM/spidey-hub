<script lang="ts">
  // Harness-only wrapper: mounts EmploymentRecords.svelte alone and reproduces the one piece of cross-component routing Terminal.svelte normally owns — PaneTree.svelte's generic per-pane-ref keydown delegation — since EmploymentRecords exports `handleKey()` but attaches no listener of its own, and its two keyboard-only interactions (j/k movement, Enter-to-edit) would otherwise be unreachable from a direct mount.
  //
  // Lives beside its own harness spec (not in this feature's real
  // `components/` tree) since it exists only to let the harness route mount
  // this one piece with Terminal's routing reproduced — it is test support,
  // not production UI.
  import { onMount } from "svelte";
  import EmploymentRecords from "../../../components/EmploymentRecords.svelte";
  import type { PersonnelData } from "../../../../../common/lib/data";
  import type { CollectionEntry } from "astro:content";

  interface Props {
    personnel: PersonnelData;
    personnelEntries: CollectionEntry<"personnel">[];
  }

  const { personnel, personnelEntries }: Props = $props();

  let ref = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** True only once this island has hydrated — guards against a spec pressing `j`/`Enter` before `client:load`'s JS attaches `<svelte:window>`'s listener, since the server-rendered HTML is present first. */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });

  function handleKey(e: KeyboardEvent) {
    ref?.handleKey(e);
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- `isFocused: true` because this harness's only mounted instance is trivially the focused one — in the real app this comes from PaneTree.svelte's multi-instance focus tracking, which this kernel-free harness excludes. -->
<EmploymentRecords bind:this={ref} {personnel} {personnelEntries} isFocused={true} />
<div data-testid="employment-harness-ready" data-ready={ready}></div>
