<script lang="ts">
  // Shared top-straddling pill badge, rendered by every Repositories/
  // Employment Records/Help panel.
  //
  // Two accents: "blue" (default — red-glow/blue-border pill, red spider
  // glyph) and "teal" (Help's section-header pill, teal spiderman glyph).
  //
  // `variant="repositories"` is the one consumer whose wrapper is
  // left-aligned, with the glyph BETWEEN the bracketed number and the
  // label (`[N] <glyph> Label`); every other consumer keeps the centered
  // wrapper.
  //
  // The wrapper straddles whatever ancestor panel has `position:relative`
  // — it is not itself the panel's border/background, just the floating
  // pill on top of it — and `pointer-events:none` keeps it from stealing
  // clicks meant for the panel underneath.
  interface Props {
    /** Panel number shown before the label — `1` in "[1] Repositories"
     * (repositories variant) or "1 · Status" (default).
     *
     * Omit with `label` when using split-text (`left`/`right`) mode
     * instead. */
    n?: number;
    /** Panel label shown after the number. */
    label?: string;
    /** Split-text mode: renders `{left} <glyph> {right}` instead of
     * `[{n}] {label}` (Employment Records' "Employment <glyph> Records" /
     * "File <glyph> Preview" badges).
     *
     * Blue accent only; pass both or neither. */
    left?: string;
    right?: string;
    /** "blue" (default): red-glow/blue-border pill.
     *
     * "teal": Help's section-header pill (teal glyph, teal border/glow). */
    accent?: "blue" | "teal";
    /** Renders the pill inline instead of the default absolutely-positioned
     * wrapper that straddles a panel's top border — used by Help's section
     * headers, which sit the pill at the start of a flex row instead of
     * straddling anything. */
    inline?: boolean;
    /** "repositories": left-aligned wrapper, glyph between the bracketed
     * number and the label (`[N] <glyph> Label`).
     *
     * "default": centered wrapper, glyph before the number (or between
     * split words). */
    variant?: "repositories" | "default";
  }

  const {
    n,
    label,
    left,
    right,
    accent = "blue",
    inline = false,
    variant = "default",
  }: Props = $props();
  // $derived, not plain const: a plain const over $props() destructures
  // would capture only the initial left/right/variant/inline values, so a
  // parent re-rendering this badge with different props would never
  // update it (svelte-check's state_referenced_locally warning was a real
  // latent bug here, not noise — see PR 4.7's per-site analysis).
  const isSplit = $derived(left !== undefined && right !== undefined);
  const isRepositories = $derived(variant === "repositories");
  const wrapperStyle = $derived(
    inline
      ? "display:flex;flex:none"
      : `position:absolute;left:0;right:0;top:0;transform:translateY(-50%);display:flex;justify-content:${
          isRepositories ? "flex-start" : "center"
        };${isRepositories ? "padding-left:12px;" : ""}pointer-events:none;z-index:4`,
  );
</script>

<div data-testid="panel-badge" data-accent={accent} style={wrapperStyle}>
  {#if accent === "teal"}
    <span
      style="display:flex;align-items:center;gap:8px;border:1px solid rgba(87,226,201,.5);border-radius:3px;background:rgba(5,7,10,.92);box-shadow:0 0 14px rgba(87,226,201,.16);padding:3px 12px;font:600 11.5px 'JetBrains Mono',monospace;letter-spacing:.16em;color:#57e2c9;white-space:nowrap"
    >
      <img
        src="/assets/spiderman-teal.svg"
        alt=""
        aria-hidden="true"
        style="width:10px;height:14px;display:block"
      />
      {#if n !== undefined}{n} ·
      {/if}{label}
    </span>
  {:else}
    <span
      style="display:flex;align-items:center;gap:9px;border:1px solid rgba(74,159,224,.5);border-radius:3px;background:rgba(10,14,19,.96);box-shadow:0 0 20px rgba(224,69,60,.18),inset 0 0 14px rgba(74,159,224,.12);padding:2px 13px;font-size:11.5px;letter-spacing:.2em;color:#8fd0f5;white-space:nowrap"
    >
      {#if isSplit}
        {left}
        <img
          src="/assets/spider-glyph-red.svg"
          alt=""
          aria-hidden="true"
          style="width:13px;height:13px;display:block;filter:drop-shadow(0 0 6px rgba(224,69,60,.6))"
        />
        {right}
      {:else if isRepositories}
        [{n}]
        <img
          src="/assets/spider-glyph-red.svg"
          alt=""
          aria-hidden="true"
          style="width:13px;height:13px;display:block;filter:drop-shadow(0 0 6px rgba(224,69,60,.6))"
        />
        {label}
      {:else}
        <img
          src="/assets/spider-glyph-red.svg"
          alt=""
          aria-hidden="true"
          style="width:13px;height:13px;display:block;filter:drop-shadow(0 0 6px rgba(224,69,60,.6))"
        />
        {n} · {label}
      {/if}
    </span>
  {/if}
</div>
