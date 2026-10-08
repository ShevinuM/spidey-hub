<script lang="ts">
  // The shared pane frame: a hairline-bordered box with a PanelBadge straddling its top edge; panes under a badge pad 19px on top so content clears it.
  // Pass `clip` when the box must be `overflow:hidden`, so the badge renders as a sibling outside the clipped box instead of inside it.
  // Never put a mask on the frame, because it would fade the frame's own border; mask the scroller inside it.
  // Pages choose their own selection-fill token for rows; the frame draws no fill, background or shadow, so focus shows only on the badge.
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import PanelBadge from "./PanelBadge.svelte";

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "style" | "class" | "children"> {
    /** Badge index, e.g. 2. */
    n: number;
    /** Badge label, already uppercase. */
    label: string;
    /** True where keystrokes land; passed to the badge. Default false. */
    focused?: boolean;
    /** Full CSS padding of the bordered box, e.g. "19px 10px 8px". */
    padding: string;
    /** CSS border-radius of the bordered box. Default `var(--radius-panel)`. */
    radius?: string;
    /** Border colour of the bordered box. Default `var(--color-pane-hairline)`. */
    hairline?: string;
    /** Makes the bordered box `overflow:hidden` and renders the badge outside it. */
    clip?: boolean;
    /** Placement in the parent, e.g. "flex:1.1;min-height:0". */
    layout?: string;
    /** Content layout of the bordered box, e.g. "display:flex;flex-direction:column". */
    body?: string;
    children: Snippet;
  }

  const {
    n,
    label,
    focused = false,
    padding,
    radius = "var(--radius-panel)",
    hairline = "var(--color-pane-hairline)",
    clip = false,
    layout,
    body,
    children,
    ...rest
  }: Props = $props();

  /** Joins the style segments that are present, skipping absent ones. */
  function styleOf(...parts: (string | undefined)[]): string {
    return parts.filter((part) => part !== undefined && part !== "").join(";");
  }

  const frameBox = $derived(
    `border:1px solid ${hairline};border-radius:${radius};padding:${padding}`,
  );
</script>

{#if clip}
  <div style={styleOf("position:relative", layout, "display:flex;flex-direction:column")}>
    <PanelBadge {n} {label} {focused} />
    <div
      {...rest}
      style={styleOf("position:relative;flex:1;min-height:0;overflow:hidden", frameBox, body)}
    >
      {@render children()}
    </div>
  </div>
{:else}
  <div {...rest} style={styleOf("position:relative", layout, frameBox, body)}>
    <PanelBadge {n} {label} {focused} />
    {@render children()}
  </div>
{/if}
