<script lang="ts">
  // Shared top-straddling pill badge — every panel across Repositories/
  // Employment Records renders one of these centered on its own top border
  // (mockup: UI-Mockups/builds-page-design-review/Builds.dc.html's "[1]
  // Status" pill et al; byte-identical markup repeated per panel there,
  // pulled out into one component here). Two accents: "blue" (the default —
  // red-glow/blue-border pill every Repositories/Personnel panel uses) and
  // "teal" (Help's section-header pill — Help-Panel-Changes.md /
  // Help.dc.html lines ~150-152). Text is always `{n} · {label}` — callers
  // pass the bare panel number and label, not a pre-joined string, so a
  // verifier/test can assert on `n`/`label` independently of the separator
  // glyph.
  //
  // The wrapper below (`position:absolute;...;transform:translateY(-50%)`)
  // straddles whatever ancestor panel box has `position:relative` — it is
  // NOT itself the panel's border/background, just the floating pill on top
  // of it, exactly like the mockup's own markup. `pointer-events:none` on
  // the wrapper keeps the badge from stealing clicks meant for the panel
  // underneath (the mockup's own convention, unchanged here).
  interface Props {
    /** Panel number shown before the separator, e.g. `0` in "0 · Status".
     * Omit together with `label` when using `left`/`right` split-text mode
     * instead (Employment Records' badges — see below). */
    n?: number;
    /** Panel label shown after the separator, e.g. "Status". */
    label?: string;
    /** Split-text mode: renders `{left} <glyph> {right}` instead of
     * `{n} · {label}` — the glyph sits BETWEEN two words rather than before
     * a numbered label (Employment Records' "Employment <glyph> Records" /
     * "File <glyph> Preview" badges, UI-Mockups Personnel.dc.html). Blue
     * accent only; pass both or neither. */
    left?: string;
    right?: string;
    /** "blue" (default): red-glow/blue-border pill used on every
     * Repositories/Employment Records panel. "teal": Help's section-header
     * pill (spiderman-teal glyph, teal border/glow). */
    accent?: "blue" | "teal";
    /** Renders the pill inline, in normal flow, instead of the default
     * absolutely-positioned wrapper that straddles a panel's top border.
     * Help's section headers sit the pill inline at the start of a flex row
     * (pill + dotted rule + hint), not straddling anything — see
     * Help.dc.html line ~150. */
    inline?: boolean;
  }

  const { n, label, left, right, accent = "blue", inline = false }: Props = $props();
  const isSplit = left !== undefined && right !== undefined;
  const wrapperStyle = inline
    ? "display:flex;flex:none"
    : "position:absolute;left:0;right:0;top:0;transform:translateY(-50%);display:flex;justify-content:center;pointer-events:none;z-index:4";
</script>

<div data-testid="panel-badge" data-accent={accent} style={wrapperStyle}>
  {#if accent === "teal"}
    <span
      style="display:flex;align-items:center;gap:8px;border:1px solid rgba(87,226,201,.5);border-radius:3px;background:rgba(5,7,10,.92);box-shadow:0 0 14px rgba(87,226,201,.16);padding:3px 12px;font:600 11.5px 'JetBrains Mono',monospace;letter-spacing:.16em;color:#57e2c9;white-space:nowrap"
    >
      <img src="/assets/spiderman-teal.svg" alt="" aria-hidden="true" style="width:10px;height:14px;display:block" />
      {#if n !== undefined}{n} · {/if}{label}
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
