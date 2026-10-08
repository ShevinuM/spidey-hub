<script lang="ts">
  // The one pane badge shape: a square pixel frame holding an index block and a label, centred on and straddling the top edge of its nearest positioned ancestor.
  // Labels arrive already uppercase and are drawn exactly as given.
  // The positioned ancestor must not clip (`overflow:hidden`), because the frame's outer step and glow extend past the badge box; a clipping pane renders the badge as a sibling outside its clipped box instead.
  interface Props {
    /** Index shown in the solid red block, e.g. 1. */
    n: number;
    /** Label shown as written; callers pass uppercase (e.g. "EMPLOYMENT RECORDS"). */
    label: string;
  }

  const { n, label }: Props = $props();
</script>

<div
  data-testid="panel-badge"
  style="position:absolute;left:0;right:0;top:0;transform:translateY(-50%);display:flex;justify-content:center;pointer-events:none;z-index:4"
>
  <span
    data-testid="panel-badge-frame"
    style="display:flex;align-items:stretch;background:var(--color-deep-bg);box-shadow:inset 0 0 0 1px rgba(74,159,224,.4),0 0 0 3px var(--color-deep-bg),0 0 0 4px rgba(224,69,60,.22),0 0 14px rgba(224,69,60,.1);font-size:10.5px;line-height:normal;color:var(--color-friendly-blue);white-space:nowrap"
    ><span
      data-testid="panel-badge-index"
      style="display:flex;align-items:center;background:var(--color-alert);color:var(--color-deep-bg);font-weight:700;padding:2px 6px;letter-spacing:.05em"
      >{n}</span
    ><span
      data-testid="panel-badge-label"
      style="display:flex;align-items:center;padding:2px 7px 2px 10px;letter-spacing:.26em"
      >{label}</span
    ></span
  >
</div>
