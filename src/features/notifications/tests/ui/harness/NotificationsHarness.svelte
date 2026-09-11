<script lang="ts">
  // Harness-only wrapper: mounts Notifications.svelte alone, reproducing
  // just the one piece of cross-component routing Terminal.svelte normally
  // owns — the global `n`/Esc keydown delegation into Notifications.svelte's
  // own exported `handleKey()` (Terminal.svelte:362/851 attach the window
  // listener and call `notificationsRef?.handleKey(e)`; Notifications.svelte
  // itself attaches no listener of its own). Mirrors the shape
  // HelpHarness.svelte already reimplements for HelpView/HelpSearch. No
  // view-gating logic is needed here (unlike Terminal's
  // `core.view === "home"` guard) since this harness never mounts any other
  // view to switch away to.
  //
  // `view="home"` and `fixtureMode={false}` are hardcoded below, NOT
  // derived from `process.env.PORTFOLIO_FIXTURES` the way every real page
  // computes its own `notificationsFixtureMode` prop — this harness route
  // only ever builds under PORTFOLIO_FIXTURES=1, so mirroring that
  // derivation would always pass `fixtureMode={true}`, and
  // NotificationsState's `onMount` (notificationsState.svelte.ts) short-
  // circuits straight to `buildFixtureState()` whenever fixtureMode is
  // true — skipping `injectVisit`/`spawnToast` entirely, so no toast would
  // ever appear. Same reasoning boot's own harness spec documents for
  // deliberately skipping the boot-seen seed: a fixture-shaped mount here
  // would prove nothing about the real toast pipeline this harness exists
  // to test.
  //
  // Lives beside its own harness spec (not in this feature's real
  // `components/` tree) since it exists only to let the harness route mount
  // this one piece with Terminal's routing reproduced — it is test support,
  // not production UI.
  import { onMount } from "svelte";
  import Notifications from "../../../components/Notifications.svelte";
  import type { NotificationsData } from "../../../../../common/lib/data";

  interface Props {
    notifications: NotificationsData;
  }

  const { notifications }: Props = $props();

  let notificationsRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** True only once this island has actually hydrated — same race
   * HelpHarness.svelte's own `ready` flag guards against: the
   * server-rendered HTML exists before `client:load`'s JS runs, so a spec
   * pressing `n` immediately after navigation would otherwise race
   * `<svelte:window>`'s listener attaching. `onMount` only ever runs
   * client-side, after mount, so this flips exactly once hydration is done
   * and the spec has something real to wait on. */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });

  function handleKey(e: KeyboardEvent) {
    notificationsRef?.handleKey(e);
  }
</script>

<svelte:window onkeydown={handleKey} />

<Notifications bind:this={notificationsRef} {notifications} view="home" fixtureMode={false} />
<div data-testid="notifications-harness-ready" data-ready={ready}></div>
