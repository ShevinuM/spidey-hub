<script lang="ts">
  // Command log rendering — moved out of Builds.svelte during the
  // folder+state-class relocation refactor. Pure relocation: same DOM and
  // inline styles as the original inline markup; tokenizeLogLine moved to
  // src/lib/commandLog.ts (pure, rune-free).
  import type { BuildsData } from "../../lib/data";
  import { tokenizeLogLine } from "../../lib/commandLog";

  interface Props {
    builds: BuildsData;
  }

  const { builds }: Props = $props();

  const commandLogColors = ["#5fc6b4", "rgba(196,216,232,.6)", "rgba(196,216,232,.45)"];
</script>

<div
  style="position:relative;flex:1;min-height:0;border:1px solid rgba(224,69,60,.35);border-radius:4px;padding:12px 14px 10px;display:flex;flex-direction:column"
>
  <div
    style="position:absolute;top:-8px;left:10px;background:#0a0e13;padding:0 6px;font-size:12px;color:rgba(224,69,60,.85)"
  >
    {builds.panels.commandLog.title}
  </div>
  <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:6px">
    {#each builds.commandLog as line, li (li)}
      <div style="color:{commandLogColors[li] ?? commandLogColors[commandLogColors.length - 1]}">
        {#each tokenizeLogLine(line) as token, ti (ti)}
          {#if token.kind === "emphasis"}<span style="color:rgba(217,176,74,.9)">{token.text}</span
            >{:else if token.kind === "link"}<a href={token.href} target="_blank" rel="noreferrer"
              >{token.text}</a
            >{:else}{token.text}{/if}
        {/each}
      </div>
    {/each}
  </div>
</div>
