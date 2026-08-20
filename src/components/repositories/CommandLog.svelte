<script lang="ts">
  // Panel [5]: Command Log — UI v2 made this panel focusable (bare `5`),
  // using the same RepositoriesPanel chrome (badge, border, copySource
  // gating) as every other panel instead of its own hand-rolled corner
  // title. tokenizeLogLine lives in src/lib/commandLog.ts (pure, rune-free).
  // Read-only content — no arrow-key/Enter row interaction, so
  // Repositories.svelte's keymap has no dedicated `focusedPanel === 5`
  // block (bare digit `5` still moves focus/the border here, same as every
  // panel).
  import type { RepositoriesData, CommandLogLine } from "../../lib/data";
  import type { RepositoriesState } from "./repositoriesState.svelte";
  import { tokenizeLogLine } from "../../lib/commandLog";
  import RepositoriesPanel from "./RepositoriesPanel.svelte";

  interface Props {
    repositories: RepositoriesData;
    /** src/content/command-log/command-log.md, mapped at build time — see
     * Repositories.svelte's own prop doc comment. */
    commandLog: CommandLogLine[];
    state: RepositoriesState;
    isFocused: boolean;
  }

  const { repositories, commandLog, state, isFocused }: Props = $props();

  const commandLogColors = ["#5fc6b4", "rgba(196,216,232,.6)", "rgba(196,216,232,.45)"];
</script>

<RepositoriesPanel
  testid="repositories-panel-5"
  copySource={isFocused && state.focusedPanel === 5}
  flex="none"
  padding="12px 14px 10px"
  columnBody
  border={state.panelBorder(5)}
  n={5}
  label={repositories.panels.commandLog.label}
>
  {#snippet children()}
    <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:6px">
      {#each commandLog as line, li (li)}
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
  {/snippet}
</RepositoriesPanel>
