<script lang="ts">
  // Harness-only wrapper: mounts GrepOverlay.svelte alone, reproducing just
  // the one piece of cross-component routing Terminal.svelte normally owns
  // — the global keydown delegation into GrepOverlay.svelte's own exported
  // `handleKey()` (Terminal.svelte calls this unconditionally, first, on
  // every keydown; GrepOverlay.svelte itself attaches no listener of its
  // own). Mirrors the shape RepositoriesHarness.svelte/
  // NotificationsHarness.svelte already reimplement for the same "exports
  // handleKey, attaches nothing" shape.
  //
  // `onNavigate` is a no-op here: the real mount wires it to
  // `core.switchToView` (Terminal's tmux window switcher), which this
  // kernel-free harness has no equivalent of. Enter on a hit still closes
  // the overlay (GrepOverlay.svelte's own `openSelectedRow()` always
  // closes first), so the harness's own navigation-adjacent assertions
  // only ever check that the overlay closes, never that a view changed.
  //
  // Lives beside its own harness spec (not in this feature's real
  // `components/` tree) since it exists only to let the harness route mount
  // this one piece with Terminal's routing reproduced — it is test support,
  // not production UI.
  import { onMount } from "svelte";
  import GrepOverlay from "../../../components/GrepOverlay.svelte";
  import type { GrepData } from "../../../../../common/lib/data";

  interface Props {
    grep: GrepData;
  }

  const { grep }: Props = $props();

  let ref = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** True only once this island has actually hydrated — same race
   * RepositoriesHarness.svelte's/NotificationsHarness.svelte's own `ready`
   * flags guard against: the server-rendered HTML is present before
   * `client:load`'s JS runs, so a spec pressing `/` immediately after
   * navigation would otherwise race `<svelte:window>`'s listener
   * attaching. `onMount` only ever runs client-side, after mount, so this
   * flips exactly once hydration is done. */
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
