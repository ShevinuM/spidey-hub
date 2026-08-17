<script lang="ts">
  // Help window (PLAN.md Phase 1 item 13 / "Help window (#13)") — the new
  // sixth status-bar window ("5:help"). Renders src/data/help.yaml's
  // sections/rows verbatim; this component owns no copy of its own beyond
  // structure/styling, same content-purity rule as every other view.
  //
  // Reachable via `Ctrl-b ?` (tmux list-keys), `Ctrl-b 5`, a status-bar
  // click, and the dashboard menu's Help row — Terminal.svelte wires all
  // four to the same `setView("help")`.
  //
  // j/k scrolling (the one interactive behavior beyond static rendering):
  // same `bind:this` + `handleKey(): boolean` delegation contract every
  // other view uses (Builds/Personnel/Profile) — Terminal.svelte tries this
  // before falling through to its own generic handling.
  import type { HelpData } from "../lib/data";

  interface Props {
    help: HelpData;
  }

  const { help }: Props = $props();

  let scrollerEl = $state<HTMLDivElement | null>(null);

  const SCROLL_STEP_PX = 48;

  export function handleKey(e: KeyboardEvent): boolean {
    if (!scrollerEl) return false;
    if (e.key === "j" || e.key === "ArrowDown") {
      scrollerEl.scrollBy({ top: SCROLL_STEP_PX });
      return true;
    }
    if (e.key === "k" || e.key === "ArrowUp") {
      scrollerEl.scrollBy({ top: -SCROLL_STEP_PX });
      return true;
    }
    return false;
  }
</script>

<div style="flex:1;min-height:0;display:flex;padding:18px 22px 14px">
  <div
    style="position:relative;flex:1;min-width:0;display:flex;flex-direction:column;background:rgba(9,13,18,.6);backdrop-filter:blur(3px);border:1px solid rgba(224,69,60,.35);border-radius:6px;padding:16px 18px 12px;font-size:13px;box-shadow:0 24px 80px rgba(0,0,0,.5)"
  >
    <div
      style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#0a0e13;padding:0 10px;color:#e0453c;letter-spacing:.14em"
    >
      {help.title}
    </div>

    <div
      bind:this={scrollerEl}
      data-testid="help-scroller"
      data-copy-source
      class="help-scroller"
      style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:16px;padding-top:8px"
    >
      {#each help.sections as section (section.title)}
        <div>
          <div style="color:#5fc6b4;letter-spacing:.1em;font-size:12px;margin-bottom:4px">{section.title}</div>
          <div style="display:flex;flex-direction:column;gap:2px">
            {#each section.rows as row (row.key + row.description)}
              <div
                data-testid="help-row"
                data-planned={row.status === "planned"}
                style="display:grid;grid-template-columns:minmax(140px,260px) 1fr;gap:10px;padding:2px 0;color:{row.status ===
                'planned'
                  ? 'rgba(196,216,232,.4)'
                  : 'rgba(196,216,232,.8)'}"
              >
                <span style="color:{row.status === 'planned' ? 'rgba(217,176,74,.55)' : 'rgba(217,176,74,.9)'}"
                  >{row.key}</span
                >
                <span
                  >{row.description}{#if row.status === "planned"}<span style="color:rgba(196,216,232,.35)">
                      ({help.plannedNote})</span
                    >{/if}</span
                >
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <div style="padding-top:8px;font-size:12px;color:rgba(196,216,232,.4)">{help.scrollHint}</div>
  </div>
</div>

<style>
  .help-scroller {
    scrollbar-width: none;
  }
  .help-scroller::-webkit-scrollbar {
    display: none;
  }
</style>
