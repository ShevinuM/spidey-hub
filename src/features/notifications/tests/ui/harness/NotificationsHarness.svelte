<script lang="ts">
  import { onMount } from "svelte";
  import Notifications from "../../../components/Notifications.svelte";
  import type { NotificationsData } from "../../../../../common/lib/data";

  interface Props {
    notifications: NotificationsData;
  }

  const { notifications }: Props = $props();

  let notificationsRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** True only once this island has hydrated, so a spec pressing `n` right after navigation doesn't race `<svelte:window>`'s listener attaching. */
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
