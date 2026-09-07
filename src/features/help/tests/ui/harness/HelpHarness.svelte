<script lang="ts">
  // Harness-only wrapper: mounts HelpView + HelpSearch together with the
  // minimal keydown routing needed to reach both from a single page, without
  // pulling in the full kernel (Terminal.svelte). In the real app, Terminal
  // owns this routing (deciding when `?` opens the palette vs. forwarding a
  // keystroke to whichever view is active, plus gating against editor/grep/
  // Cmdline/status-bar-prompt state that doesn't exist here at all) — this
  // component only reimplements the three-way split needed for both pieces
  // to be reachable in isolation: while the palette is open, every key goes
  // to it; a bare `?` opens the palette; otherwise the key goes to HelpView.
  // No gating logic, because nothing here can ever be open to gate against.
  //
  // Lives beside its own harness spec (not in this feature's real
  // `components/` tree) since it exists only to let the harness route mount
  // two independently-driven components together — it is test support, not
  // production UI.
  import { onMount } from "svelte";
  import HelpView from "../../../components/HelpView.svelte";
  import HelpSearch from "../../../components/HelpSearch.svelte";
  import type { CmdlineData, HelpData, HelpSearchData, ShellData } from "../../../../../common/lib/data";

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

  /** The last command action HelpSearch resolved via Enter — rendered into a
   * testid'd element rather than asserted as a real navigation, since
   * `executeSiteAction` (Terminal.svelte's own dispatcher) doesn't exist
   * here; the harness only needs to prove the palette itself resolved and
   * closed on a command row, not that the site actually navigated. */
  let lastExecuted = $state<string | undefined>(undefined);

  /** True only once this island has actually hydrated — the server-rendered
   * HTML (including HelpView's own content) is present before any JS runs,
   * so a spec that presses `?` immediately after navigation would otherwise
   * race `<svelte:window>`'s listener attaching. `onMount` only ever runs
   * client-side, after mount, so this flips exactly once hydration is done
   * and the spec has something real to wait on. */
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
