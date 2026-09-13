<script lang="ts">
  // Harness-only wrapper: mounts Shell.svelte alone in PANE mode,
  // reproducing just the global keydown delegation into its exported
  // `handleKey()` that Terminal.svelte/PaneTree.svelte normally provide
  // (same shape GrepHarness.svelte/RepositoriesHarness.svelte reimplement).
  // Host mode is out of scope here — it needs a live session roster and
  // onAttach/onCreateAndAttach/onAttachView wiring this kernel-free harness
  // has no equivalent of.
  import { onMount } from "svelte";
  import Shell from "../../../components/Shell.svelte";
  import type { ShellData } from "../../../../../common/lib/data";
  import { createShellState } from "../../../../../common/lib/shell";
  import type { Pane } from "../../../../../common/engines/tmux/tmux";

  interface Props {
    shell: ShellData;
  }

  const { shell }: Props = $props();

  const pane = $state<Pane>({ id: "harness", program: "shell", shell: createShellState() });

  let ref = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** True only once `client:load` hydration has finished — guards a spec's
   * first keypress from racing `<svelte:window>`'s listener attaching. */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });

  function handleKey(e: KeyboardEvent) {
    ref?.handleKey(e);
  }
</script>

<svelte:window onkeydown={handleKey} />

<Shell
  bind:this={ref}
  {shell}
  {pane}
  mode="pane"
  viewNames={["dashboard", "repositories", "employment", "retina-v", "profile", "help"]}
  session={{ name: "10.42.7.13", windowCount: 1, createdAt: 0, attached: true }}
  sessions={[]}
  defaultSessionName="10.42.7.13"
  onLaunch={() => {}}
  onExit={() => {}}
  onReboot={() => {}}
/>
<div data-testid="shell-fs-harness-ready" data-ready={ready}></div>
