<script lang="ts">
  // Shared bordered-box + top-straddling PanelBadge chrome for the five Repositories panels; `variant="repositories"` scopes the left-aligned, glyph-between-number-and-label rendering to this page only.
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
    /** Badge panel number, e.g. `0` for "[0] Status". */
    n: number;
    /** Badge label, e.g. "Status". */
    label: string;
    children?: Snippet;
  }

  const { testid, copySource, flex, minHeight = false, padding, columnBody = false, border, n, label, children }: Props =
    $props();
</script>

<div
  data-testid={testid}
  data-copy-source={copySource ? "" : undefined}
  style="position:relative;flex:{flex};{minHeight ? 'min-height:0;' : ''}border:1px solid {border};border-radius:4px;padding:{padding}{columnBody
    ? ';display:flex;flex-direction:column'
    : ''}"
>
  <PanelBadge {n} {label} variant="repositories" />
  {#if children}{@render children()}{/if}
</div>
