<script lang="ts">
  // Help window ("5:help") — sidebar-scoped keymap reference plus a live
  // filter, following Mockup A's layout (header + 230px scope sidebar +
  // section rows with right-aligned key chips). Renders the `HelpData`
  // built from src/data/help.yaml's chrome plus the `help` content
  // collection's scopes verbatim; this component owns no copy of its own
  // beyond structure/styling.
  //
  // Reachable via `Ctrl-b ?`, `Ctrl-b 5`, a status-bar click, and the
  // dashboard menu's Help row.
  //
  // Row layout: each row is its OWN 2-column CSS grid (`1fr auto`) rather
  // than one grid shared across every row — the key-chips column then sizes
  // to that row's own content instead of a fixed width, which is what
  // guarantees no row's name/description/chips ever wraps to a second line
  // at any viewport (the one deviation from the mockup's fixed `300px`
  // column — see tests/e2e/help-layout.spec.ts).
  import type { HelpData, HelpRow } from "../common/lib/data";
  import PanelBadge from "../common/components/PanelBadge.svelte";

  interface Props {
    help: HelpData;
    isFocused: boolean;
  }

  const { help, isFocused }: Props = $props();

  let scrollerEl = $state<HTMLDivElement | null>(null);
  let activeScope = $state("all");
  let filterQuery = $state("");
  let filterFocused = $state(false);

  const SCROLL_STEP_PX = 48;

  const totalCount = $derived(help.scopes.reduce((n, s) => n + s.rows.length, 0));

  const tabs = $derived([
    { id: "all", label: help.allScopeLabel, count: totalCount },
    ...help.scopes.map((s) => ({ id: s.id, label: s.label, count: s.rows.length })),
  ]);

  function matchesQuery(row: HelpRow, q: string): boolean {
    if (!q) return true;
    return (row.name + " " + row.desc + " " + row.keys.join(" ")).toLowerCase().includes(q);
  }

  const query = $derived(filterQuery.trim().toLowerCase());

  const visibleScopes = $derived(
    help.scopes
      .filter((s) => activeScope === "all" || s.id === activeScope)
      .map((s) => ({ ...s, rows: s.rows.filter((r) => matchesQuery(r, query)) }))
      .filter((s) => s.rows.length > 0),
  );

  const shownCount = $derived(visibleScopes.reduce((n, s) => n + s.rows.length, 0));

  function pickScope(id: string) {
    activeScope = id;
  }

  function focusFilter() {
    filterFocused = true;
  }

  /** Reused delegation contract — see EmploymentRecords.svelte's own `isEditorOpen`
   * comment for the shared reasoning. While the filter box is "focused"
   * every keystroke must land in the query, never reboot/open grep/open the
   * command search out from under it (Terminal.svelte's `paneIsGreedy`). */
  export function isEditorOpen(): boolean {
    return filterFocused;
  }

  export function handleKey(e: KeyboardEvent): boolean {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (filterFocused) {
      if (e.key === "Escape") {
        filterFocused = false;
        return true;
      }
      if (e.key === "Backspace") {
        filterQuery = filterQuery.slice(0, -1);
        return true;
      }
      if (e.key.length === 1) {
        filterQuery += e.key;
        return true;
      }
      return true;
    }

    if (!scrollerEl) return false;
    if (e.key === "ArrowDown") {
      scrollerEl.scrollBy({ top: SCROLL_STEP_PX });
      return true;
    }
    if (e.key === "ArrowUp") {
      scrollerEl.scrollBy({ top: -SCROLL_STEP_PX });
      return true;
    }
    return false;
  }
</script>

<div style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:16px">
  <!-- Mockup A's own radial accent layer, kept ON TOP of the site's
       translucent wallpaper (Terminal.svelte renders Wallpaper behind every
       view at reduced opacity) rather than an opaque page background. -->
  <div
    aria-hidden="true"
    style="position:absolute;inset:0;background:radial-gradient(90% 70% at 85% 0%, rgba(87,226,201,.10), transparent 55%), radial-gradient(80% 60% at 0% 100%, rgba(255,59,78,.10), transparent 60%);pointer-events:none"
  ></div>

  <div
    style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column;font-family:'JetBrains Mono',monospace;font-size:13px"
  >
    <div
      style="position:relative;display:flex;align-items:center;gap:14px;padding:0 0 14px;border-bottom:1px solid rgba(255,59,78,.4)"
    >
      <span
        aria-hidden="true"
        style="width:14px;height:18px;flex:none;background:#ff4a4a;-webkit-mask:url(/assets/spiderman.svg) center/contain no-repeat;mask:url(/assets/spiderman.svg) center/contain no-repeat;display:block"
      ></span>
      <div
        data-testid="help-title"
        style="font:600 15px 'JetBrains Mono',monospace;color:#fff;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
      >
        {help.title}
      </div>
      <div style="flex:1;min-width:12px"></div>
      <div
        role="button"
        tabindex="0"
        data-testid="help-filter-box"
        onclick={focusFilter}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") focusFilter();
        }}
        style="position:relative;flex:none;transform:skewX(-14deg);border:1px solid rgba(87,226,201,.45);background:rgba(87,226,201,.06);padding:7px 14px;min-width:260px;cursor:text"
      >
        <div
          style="transform:skewX(14deg);display:flex;align-items:center;white-space:nowrap;overflow:hidden;font:500 12px 'JetBrains Mono',monospace;color:#57e2c9;letter-spacing:.06em"
        >
          {#if filterQuery}
            <span data-testid="help-filter-text">{filterQuery}</span>
          {:else}
            <span style="opacity:.5">{help.filterPlaceholder}</span>
          {/if}
          {#if filterFocused}
            <span
              data-testid="help-filter-cursor"
              style="display:inline-block;width:6px;height:12px;margin-left:2px;background:#57e2c9;animation:blk 1.1s steps(1) infinite"
            ></span>
          {/if}
        </div>
      </div>
      <div
        data-testid="help-match-count"
        style="flex:none;font:500 11px 'JetBrains Mono',monospace;color:rgba(223,232,230,.45);min-width:78px;text-align:right;white-space:nowrap"
      >
        {shownCount} shown
      </div>
    </div>

    <div style="position:relative;display:grid;grid-template-columns:230px 1fr;flex:1;min-height:0">
      <div
        style="min-height:0;overflow-y:auto;border-right:1px solid rgba(255,255,255,.07);padding:18px 0;background:rgba(255,255,255,.014)"
      >
        <div
          style="font:400 10px 'JetBrains Mono',monospace;color:rgba(223,232,230,.3);letter-spacing:.12em;padding:0 20px 12px"
        >
          Scopes
        </div>
        {#each tabs as t (t.id)}
          <div
            role="button"
            tabindex="0"
            class="help-scope-tab"
            data-testid="help-scope-tab"
            data-scope-id={t.id}
            data-active={t.id === activeScope}
            onclick={() => pickScope(t.id)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") pickScope(t.id);
            }}
            style="cursor:pointer;position:relative;padding:11px 20px;display:flex;align-items:center;justify-content:space-between;gap:8px"
          >
            <div
              class="help-scope-label"
              style="font:600 12px 'JetBrains Mono',monospace;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
            >
              {t.label}
            </div>
            <div style="font:400 10px 'JetBrains Mono',monospace;color:rgba(223,232,230,.35);flex:none">{t.count}</div>
            <div class="help-scope-bar"></div>
          </div>
        {/each}
        <div
          style="margin:22px 20px 0;padding-top:16px;border-top:1px solid rgba(255,255,255,.07);font:400 10px/1.8 'JetBrains Mono',monospace;color:rgba(223,232,230,.4)"
        >
          {#each help.legend as line (line)}
            <div>{line}</div>
          {/each}
        </div>
      </div>

      <div
        bind:this={scrollerEl}
        data-testid="help-scroller"
        data-copy-source={isFocused ? "" : undefined}
        class="help-scroller"
        style="min-height:0;overflow-y:auto;padding:16px 0 26px"
      >
        {#each visibleScopes as scope (scope.id)}
          <div style="margin-bottom:6px">
            <div style="display:flex;align-items:center;gap:12px;padding:12px 30px 10px">
              <PanelBadge accent="teal" label={scope.label} inline />
              <div
                style="flex:1;height:1px;background:repeating-linear-gradient(90deg,rgba(87,226,201,.3) 0 3px,transparent 3px 7px)"
              ></div>
              <div style="font:400 10px 'JetBrains Mono',monospace;color:rgba(223,232,230,.35);white-space:nowrap;flex:none">
                {scope.hint}
              </div>
            </div>
            {#each scope.rows as row (row.name + row.desc)}
              <div
                class="help-row"
                data-testid="help-row"
                style="display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;padding:9px 30px"
              >
                <div style="min-width:0">
                  <div
                    data-testid="help-row-name"
                    style="font:600 13px 'JetBrains Mono',monospace;letter-spacing:.02em;color:#e6efed;white-space:nowrap;overflow:hidden"
                  >
                    {row.name}
                  </div>
                  <div
                    data-testid="help-row-desc"
                    style="font:400 10.5px/1.45 'JetBrains Mono',monospace;color:rgba(223,232,230,.56);margin-top:3px;white-space:nowrap;overflow:hidden"
                  >
                    {row.desc}
                  </div>
                </div>
                <div data-testid="help-row-keys" style="display:flex;flex-wrap:nowrap;gap:6px;justify-content:flex-end">
                  {#each row.keys as k}
                    <div
                      style="transform:skewX(-16deg);border:1px solid rgba(255,59,78,.55);background:linear-gradient(180deg,rgba(255,59,78,.16),rgba(255,59,78,.03));padding:4px 12px;min-width:34px;text-align:center;flex:none"
                    >
                      <div style="transform:skewX(16deg);font:500 12px 'JetBrains Mono',monospace;color:#ffd7dc;white-space:nowrap">
                        {k}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/each}
        {#if visibleScopes.length === 0}
          <div
            data-testid="help-empty"
            style="padding:60px 30px;text-align:center;font:400 12px 'JetBrains Mono',monospace;color:rgba(223,232,230,.4)"
          >
            {help.emptyStateText}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .help-scroller {
    scrollbar-width: none;
  }
  .help-scroller::-webkit-scrollbar {
    display: none;
  }

  /* Instant hover (no transition) — matches Mockup A's own `style-hover`
     rule, which never animates. Inline `style=""` above intentionally
     leaves background/border-left/label-color unset for the non-active
     case so these rules can apply (an inline value always wins over a CSS
     rule, active or not). */
  .help-scope-tab:hover {
    background: rgba(87, 226, 201, 0.07);
  }
  .help-scope-tab[data-active="true"] {
    background: rgba(255, 59, 78, 0.14);
  }
  .help-scope-label {
    color: rgba(223, 232, 230, 0.6);
  }
  .help-scope-tab[data-active="true"] .help-scope-label {
    color: #fff;
  }
  .help-scope-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: transparent;
  }
  .help-scope-tab[data-active="true"] .help-scope-bar {
    background: #ff3b4e;
  }

  .help-row {
    border-left: 2px solid transparent;
    border-bottom: 1px solid rgba(255, 255, 255, 0.035);
  }
  .help-row:hover {
    background: rgba(87, 226, 201, 0.07);
    border-left-color: #57e2c9;
  }
</style>
