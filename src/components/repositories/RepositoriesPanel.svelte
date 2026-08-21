<script lang="ts">
  // Shared panel chrome (bordered box + top-straddling PanelBadge) for the
  // five Repositories panels. UI v2 (Builds-Panel-Changes.md): every panel's
  // OLD corner-bracket floating title ("─[N]─Label") is replaced by the
  // shared PanelBadge pill straddling the panel's own top border,
  // left-aligned, reading "[{n}] {label}" — same badge, same position, on
  // every one of the five panels (only the panel BORDER color reflects
  // focus; the badge itself never varies with it, matching the mockup
  // exactly).
  import type { Snippet } from "svelte";
  import PanelBadge from "../PanelBadge.svelte";

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
  <PanelBadge {n} {label} />
  {#if children}{@render children()}{/if}
</div>
