<script lang="ts">
  // Shared top-straddling pill badge — every panel across Repositories/
  // Employment Records/Help renders one of these (mockup:
  // UI-Mockups/builds-page-design-review/Builds.dc.html's "1 · Status"
  // pill et al; byte-identical markup repeated per panel there, pulled out
  // into one component here). Two accents: "blue" (the default —
  // red-glow/blue-border pill every Repositories/Employment Records panel
  // uses, red spider glyph `spider-glyph-red.svg`) and "teal" (Help's
  // section-header pill — Help-Panel-Changes.md / Help.dc.html lines
  // ~150-152 — teal spiderman glyph `spiderman-teal.svg`).
  //
  // "variant" scopes the ONE place the glyph's position and the wrapper's
  // alignment differ from every other consumer: Repositories
  // (variant="repositories") is left-aligned with the glyph BETWEEN the
  // bracketed number and the label (`[N] <glyph> Label`). Every other
  // "blue" consumer (Employment Records' split-text badges, and any future
  // non-split/non-repositories caller) keeps the centered wrapper with the
  // glyph before the number (`<glyph> {n} · {label}`) or between the two
  // split words (`{left} <glyph> {right}`) — the pre-existing look.
  //
  // The wrapper below (`position:absolute;...;transform:translateY(-50%)`)
  // straddles whatever ancestor panel box has `position:relative` — it is
  // NOT itself the panel's border/background, just the floating pill on top
  // of it, exactly like the mockup's own markup. `pointer-events:none` on
  // the wrapper keeps the badge from stealing clicks meant for the panel
  // underneath (the mockup's own convention, unchanged here).
  interface Props {
    /** Panel number shown before the label, e.g. `1` in "[1] Repositories"
     * (repositories variant) or "1 · Status" (default, non-split). Omit
     * together with `label` when using `left`/`right` split-text mode
     * instead (Employment Records' badges — see below). */
    n?: number;
    /** Panel label shown after the number. */
    label?: string;
    /** Split-text mode: renders `{left} <glyph> {right}` as one badge
     * instead of `[{n}] {label}` — the glyph sits BETWEEN two words rather
     * than before/inside a numbered label (Employment Records' "Employment
     * <glyph> Records" / "File <glyph> Preview" badges, UI-Mockups
     * Personnel.dc.html). Blue accent only; pass both or neither. */
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
    /** "repositories": the ONLY consumer whose wrapper is left-aligned
     * (not centered) and whose glyph sits BETWEEN the bracketed number and
     * the label (`[N] <glyph> Label`) instead of before the number.
     * "default" (default): centered wrapper, glyph before the number in
     * non-split mode or between the two words in split mode — the look
     * every other consumer (Employment Records, and non-split callers)
     * keeps. */
    variant?: "repositories" | "default";
  }

  const { n, label, left, right, accent = "blue", inline = false, variant = "default" }: Props = $props();
  const isSplit = left !== undefined && right !== undefined;
  const isRepositories = variant === "repositories";
  const wrapperStyle = inline
    ? "display:flex;flex:none"
    : `position:absolute;left:0;right:0;top:0;transform:translateY(-50%);display:flex;justify-content:${
        isRepositories ? "flex-start" : "center"
      };${isRepositories ? "padding-left:12px;" : ""}pointer-events:none;z-index:4`;
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
