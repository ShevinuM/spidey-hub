<script lang="ts">
  // The shared bordered box for the five Repositories panes, with a centred PanelBadge as its first child.
  import type { Snippet } from "svelte";
  import PanelBadge from "../../../common/components/PanelBadge.svelte";

  interface Props {
    testid?: string;
    copySource: boolean;
    flex: string;
    minHeight?: boolean;
    padding: string;
    columnBody?: boolean;
    border: string;
    /** Badge index, e.g. `0`. */
    n: number;
    /** Badge label as written in the yaml, e.g. "STATUS". */
    label: string;
    children?: Snippet;
  }

  const {
    testid,
    copySource,
    flex,
    minHeight = false,
    padding,
    columnBody = false,
    border,
    n,
    label,
    children,
  }: Props = $props();
</script>

<div
  data-testid={testid}
  data-copy-source={copySource ? "" : undefined}
  style="position:relative;flex:{flex};{minHeight
    ? 'min-height:0;'
    : ''}border:1px solid {border};border-radius:4px;padding:{padding}{columnBody
    ? ';display:flex;flex-direction:column'
    : ''}"
>
  <PanelBadge {n} {label} />
  {#if children}{@render children()}{/if}
</div>
