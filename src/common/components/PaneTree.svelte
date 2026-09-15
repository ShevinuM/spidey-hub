<script lang="ts">
  // Recursive pane-tree renderer: a "split" node renders a flex row/column
  // of its children (each sized by its parallel `sizes` fraction),
  // recursing into itself via `<svelte:self>` for each child. A "leaf" node
  // renders the shared focus-ring wrapper and delegates the actual
  // per-program content to the caller-supplied `paneLeaf` snippet.
  //
  // This file names no feature (architecture R004): the concrete leaf
  // registry lives with the caller (bootstrap/Terminal.svelte), not here.
  //
  // `refs` is a PROP, not a component-local Map, because Terminal.svelte
  // creates it once and threads the same object through every recursive
  // `<svelte:self>` call — a component-local map would fragment the
  // registry once the tree has more than one leaf instance.
  //
  // `activePaneId` gates two things per leaf: its own data-copy-source/
  // paste-target registration, so exactly one mounted instance of a
  // multi-instance program ever claims either; and the active-pane border
  // accent below, shown only around the actually-focused leaf when
  // `multiPane` is true.
  import type { Snippet } from "svelte";
  import type { Pane, PaneNode } from "../engines/tmux/tmux";

  interface Props {
    node: PaneNode;
    /** The WINDOW's currently-focused pane id — same value at every
     * recursion depth, just compared against each leaf's own pane id to
     * compute that leaf's `isFocused`. */
    activePaneId: string;
    /** True once the window has more than one pane — gates the active-pane
     * border accent (see file header). */
    multiPane: boolean;
    /** Shared, non-reactive ref registry (see the file header); only ever
     * `.set`/`.delete`'d from a leaf's own `$effect`. */
    refs: Map<string, unknown>;
    /** Renders one leaf's per-program content — owned by the caller
     * (bootstrap/Terminal.svelte's program→component switch), never by this
     * file (R004).
     *
     * Receives the leaf's own `pane`, its computed `isFocused`, a getter
     * and a setter for THIS `<svelte:self>` instance's own `leafRef`
     * (wired via a component's `bind:this={get, set}` function binding),
     * so the ref registration `$effect` below keeps
     * registering/unregistering exactly the instance this recursion level
     * actually rendered — never a registry shared across leaves. */
    paneLeaf: Snippet<
      [
        pane: Pane,
        isFocused: boolean,
        getLeafRef: () => unknown,
        setLeafRef: (ref: unknown) => void,
      ]
    >;
  }

  const { node, activePaneId, multiPane, refs, paneLeaf }: Props = $props();

  let leafRef = $state<unknown>(null);

  function getLeafRef(): unknown {
    return leafRef;
  }
  function setLeafRef(ref: unknown): void {
    leafRef = ref;
  }

  $effect(() => {
    if (node.type !== "leaf") return;
    const id = node.pane.id;
    if (leafRef) refs.set(id, leafRef);
    else refs.delete(id);
    return () => {
      refs.delete(id);
    };
  });

  const isFocused = $derived(node.type === "leaf" && node.pane.id === activePaneId);
</script>

{#if node.type === "split"}
  <div
    style="flex:1;min-height:0;min-width:0;display:flex;flex-direction:{node.direction === 'row'
      ? 'row'
      : 'column'}"
  >
    {#each node.children as child, i (i)}
      <div
        style="flex:{node.sizes[i] ??
          1} 1 0%;min-width:0;min-height:0;display:flex;flex-direction:column;{i > 0
          ? node.direction === 'row'
            ? 'border-left:1px solid rgba(196,216,232,.18)'
            : 'border-top:1px solid rgba(196,216,232,.18)'
          : ''}"
      >
        <svelte:self node={child} {activePaneId} {multiPane} {refs} {paneLeaf} />
      </div>
    {/each}
  </div>
{:else}
  <div
    data-testid="pane-leaf"
    data-pane-focused={isFocused}
    style="flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;{multiPane &&
    isFocused
      ? 'box-shadow:inset 0 0 0 1px #e0453c'
      : ''}"
  >
    {@render paneLeaf(node.pane, isFocused, getLeafRef, setLeafRef)}
  </div>
{/if}
