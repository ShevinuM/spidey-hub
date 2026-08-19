<script lang="ts">
  // Shared panel chrome (bordered box + floating title) for the six Builds
  // panels — moved out of Builds.svelte during the folder+state-class
  // relocation refactor. Every panel's outer wrapper + floating title div
  // followed this exact shape inline; this component reproduces the same
  // interpolated style string byte-for-byte per caller-supplied pieces so
  // the rendered DOM is unchanged.
  import type { Snippet } from "svelte";

  interface Props {
    testid?: string;
    copySource: boolean;
    flex: string;
    minHeight?: boolean;
    padding: string;
    columnBody?: boolean;
    border: string;
    titleColor: string;
    title: Snippet;
    children?: Snippet;
  }

  const { testid, copySource, flex, minHeight = false, padding, columnBody = false, border, titleColor, title, children }: Props =
    $props();
</script>

<div
  data-testid={testid}
  data-copy-source={copySource ? "" : undefined}
  style="position:relative;flex:{flex};{minHeight ? 'min-height:0;' : ''}border:1px solid {border};border-radius:4px;padding:{padding}{columnBody
    ? ';display:flex;flex-direction:column'
    : ''}"
>
  <div
    style="position:absolute;top:-8px;left:10px;background:#0a0e13;padding:0 6px;font-size:12px;color:{titleColor}"
  >
    {@render title()}
  </div>
  {#if children}{@render children()}{/if}
</div>
