<script lang="ts">
  // Harness-only wrapper: mounts Shell.svelte alone in PANE mode, reproducing
  // just the one piece of cross-component routing Terminal.svelte/
  // PaneTree.svelte normally own — the global keydown delegation into
  // Shell.svelte's own exported `handleKey()` (the kernel calls this first,
  // unconditionally, on every keydown; Shell.svelte itself attaches no
  // listener of its own). Mirrors the shape GrepHarness.svelte/
  // RepositoriesHarness.svelte already reimplement for the same "exports
  // handleKey, attaches nothing" shape.
  //
  // Host mode (the fullscreen detached shell, `tmux new`/`attach`/`open
  // <view>`) is deliberately NOT exercised here: it needs a live session
  // roster and onAttach/onCreateAndAttach/onAttachView wiring this
  // kernel-free harness has no equivalent of. This harness only ever mounts
  // ONE pane-mode instance — the same shape every other in-pane program
  // component's harness reproduces.
  //
  // `pane` is a synthetic `$state` Pane the wrapper owns (id "harness",
  // `program: "shell"`, a fresh `createShellState()` buffer) — Shell.svelte
  // mutates it in place (`pane.shell = ...`) exactly like PaneTree.svelte's
  // own tree of real panes, so a plain reactive object here is enough.
  // `viewNames`/`session`/`sessions`/`defaultSessionName` are harmless fixed
  // fixture values (no real tmux client backs them) — the shell's own pane-
  // mode `runCommand` reads `session`/`sessions` only for the HOST-only
  // `tmux ls`/`new`/`a` builtins, so their exact values don't affect any
  // pane-mode assertion this suite makes.
  //
  // Lives beside its own harness spec (not in this feature's real
  // `components/` tree) since it exists only to let the harness route mount
  // this one piece with Terminal's routing reproduced — it is test support,
  // not production UI.
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

  /** True only once this island has actually hydrated — same race
   * GrepHarness.svelte's/RepositoriesHarness.svelte's own `ready` flags
   * guard against: the server-rendered HTML is present before
   * `client:load`'s JS runs, so a spec pressing a key immediately after
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
