<script lang="ts">
  // Harness-only wrapper: mounts EmploymentRecords.svelte alone, reproducing
  // just the one piece of cross-component routing Terminal.svelte normally
  // owns — the generic per-pane-ref keydown delegation PaneTree.svelte's
  // shared `refs` map drives (`if (ref.handleKey(e)) return`).
  // EmploymentRecords.svelte itself attaches no listener of its own; it only
  // exports `handleKey()`. Mirrors the shape NotificationsHarness.svelte
  // already reimplements for Notifications.svelte (same "exports handleKey,
  // attaches nothing" shape) — unlike DashboardHarness.svelte, which mounts
  // its component directly because Dashboard.svelte owns no keyboard model
  // of its own.
  //
  // This one piece matters here specifically because EmploymentRecords'
  // two most distinctive interactions — j/k cursor movement and Enter
  // opening the editor — are keyboard-only and therefore unreachable from a
  // direct mount with no listener at all. Row *selection* is click-driven
  // (`onclick={() => state.select(i)}` in both RecordsPanel.svelte and
  // TimelinePanel.svelte) and needs no wrapper support.
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

  /** True only once this island has actually hydrated — same race
   * NotificationsHarness.svelte's/HelpHarness.svelte's own `ready` flags
   * guard against: the server-rendered HTML (rows, timeline, preview) is
   * present before `client:load`'s JS runs, so a spec pressing `j`/`Enter`
   * immediately after navigation would otherwise race `<svelte:window>`'s
   * listener attaching. `onMount` only ever runs client-side, after mount,
   * so this flips exactly once hydration is done. */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });

  function handleKey(e: KeyboardEvent) {
    ref?.handleKey(e);
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- `isFocused: true` — the only mounted instance, so it IS the focused one
     (gates `data-copy-source` on the row list, not asserted by this
     harness's spec). In the real app this comes from PaneTree.svelte's
     multi-instance focus tracking, which a kernel-free harness excludes. -->
<EmploymentRecords bind:this={ref} {personnel} {personnelEntries} isFocused={true} />
<div data-testid="employment-harness-ready" data-ready={ready}></div>
