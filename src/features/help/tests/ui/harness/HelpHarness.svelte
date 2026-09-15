<script lang="ts">
  // Harness-only wrapper: reimplements just the three-way keydown split
  // Terminal.svelte would otherwise own (palette-open consumes every key; a
  // bare `?` opens the palette; otherwise the key goes to HelpView) so
  // HelpView + HelpSearch are both reachable without the real kernel.
  import { onMount } from "svelte";
  import HelpView from "../../../components/HelpView.svelte";
  import HelpSearch from "../../../components/HelpSearch.svelte";
  import type {
    CmdlineData,
    HelpData,
    HelpSearchData,
    ShellData,
  } from "../../../../../common/lib/data";

  interface Props {
    help: HelpData;
    helpSearch: HelpSearchData;
    cmdline: CmdlineData;
    shell: ShellData;
  }

  const { help, helpSearch, cmdline, shell }: Props = $props();

  let helpViewRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);
  let helpSearchRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    isOpen: () => boolean;
    openPalette: () => void;
  } | null>(null);

  /** The last command action HelpSearch resolved via Enter, rendered into a
   * testid'd element since there's no real `executeSiteAction` here to
   * navigate against. */
  let lastExecuted = $state<string | undefined>(undefined);

  /** True only after this island hydrates (`onMount` runs client-side only)
   * — the server-rendered HTML exists before then, so a spec pressing `?`
   * right after navigation could otherwise race `<svelte:window>`'s
   * listener attaching. */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });

  function handleKey(e: KeyboardEvent) {
    if (helpSearchRef?.isOpen()) {
      helpSearchRef.handleKey(e);
      return;
    }
    if (e.key === "?") {
      helpSearchRef?.openPalette();
      return;
    }
    helpViewRef?.handleKey(e);
  }
</script>

<svelte:window onkeydown={handleKey} />

<HelpView bind:this={helpViewRef} {help} isFocused={true} />
<HelpSearch
  bind:this={helpSearchRef}
  {helpSearch}
  {cmdline}
  {help}
  {shell}
  onExecute={(action) => {
    lastExecuted = action;
  }}
/>
<div data-testid="help-harness-last-executed">{lastExecuted ?? ""}</div>
<div data-testid="help-harness-ready" data-ready={ready}></div>
