<script lang="ts">
  // Shared top-straddling pill badge, rendered by every Repositories/
  // Employment Records panel: a red-glow/blue-border pill with a red spider
  // glyph.
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
     * Pass both or neither. */
    left?: string;
    right?: string;
    /** "repositories": left-aligned wrapper, glyph between the bracketed
     * number and the label (`[N] <glyph> Label`).
     *
     * "default": centered wrapper, glyph before the number (or between
     * split words). */
    variant?: "repositories" | "default";
  }

  const { n, label, left, right, variant = "default" }: Props = $props();
  const isSplit = left !== undefined && right !== undefined;
  const isRepositories = variant === "repositories";
  const wrapperStyle = `position:absolute;left:0;right:0;top:0;transform:translateY(-50%);display:flex;justify-content:${
    isRepositories ? "flex-start" : "center"
  };${isRepositories ? "padding-left:12px;" : ""}pointer-events:none;z-index:4`;
</script>

<div data-testid="panel-badge" style={wrapperStyle}>
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
</div>
