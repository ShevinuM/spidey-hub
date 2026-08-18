<script lang="ts">
  // Home/dashboard card (design/Homepage.dc.html lines 142-169).
  import type { DashboardData } from "../lib/data";
  import type { ViewId } from "../lib/views";
  import { menuIdToView } from "../lib/views";

  interface Props {
    dashboard: DashboardData;
    onSelect: (view: ViewId) => void;
  }

  const { dashboard, onSelect }: Props = $props();

  function pick(menuId: string) {
    const view = menuIdToView(menuId);
    if (view) onSelect(view);
  }

  // PLAN.md Iteration 3 Phase 2 item 2.1: SPIDEY-HUB wordmark, own arched
  // rendering (never Marvel's actual logo artwork) — each character gets a
  // small rotation + vertical rise so the word bows like a dome, tallest at
  // the middle letter and tilting outward toward the ends, evoking the
  // classic arched Spider-Man wordmark without copying it. Purely
  // presentational (content-purity: the letters themselves still come from
  // dashboard.plate.title, nothing is hardcoded here) — `aria-hidden` on
  // each letter span + a single `aria-label` on the container keeps this
  // accessible/testable as one string despite the per-character markup
  // (getByText on the split text would otherwise see "S P I D E Y..." with
  // stray whitespace from the each-block).
  const WORDMARK_MAX_ANGLE = 16; // degrees the outermost letters tilt
  const WORDMARK_ARCH_PX = 10; // dome rise at the center letter

  const wordmarkChars = $derived(
    dashboard.plate.title.split("").map((ch, i, arr) => {
      const n = arr.length;
      const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0; // -1..1 across the word
      const angle = t * WORDMARK_MAX_ANGLE;
      const rise = (1 - t * t) * WORDMARK_ARCH_PX;
      return { ch, style: `transform:translateY(${(-rise).toFixed(2)}px) rotate(${angle.toFixed(2)}deg)` };
    }),
  );
</script>

<div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:20px 40px 20px 40px">
  <div
    style="width:min(940px,100%);background:rgba(9,13,18,.6);backdrop-filter:blur(3px);border:1px solid rgba(255,255,255,.05);border-radius:6px;box-sizing:border-box;padding:clamp(14px,4vh,54px) 46px clamp(10px,2.6vh,34px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,2.6vh,38px);max-height:100%;min-height:min(100%,560px);overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.45)"
  >
    <div style="display:flex;align-items:stretch;gap:10px">
      <div
        style="border:1.5px solid #e0453c;border-radius:10px;background:rgba(9,13,18,.8);padding:clamp(10px,2.6vh,18px) 34px;text-align:center;display:flex;flex-direction:column;gap:6px"
      >
        <div
          data-testid="dashboard-wordmark"
          aria-label={dashboard.plate.title}
          style="font-family:'Webslinger','JetBrains Mono',ui-monospace,monospace;font-size:clamp(20px,4.2vh,30px);font-weight:700;letter-spacing:.03em;color:#e0453c;display:flex;justify-content:center;padding-top:6px;text-shadow:0 1px 0 rgba(0,0,0,.35),0 0 18px rgba(224,69,60,.32)"
        >
          {#each wordmarkChars as { ch, style }, i (i)}
            <span aria-hidden="true" style="display:inline-block;{style}">{ch}</span>
          {/each}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:space-between;padding:4px 0">
        <div style="width:2px;height:22px;background:rgba(224,69,60,.85)"></div>
        <div style="width:2px;height:22px;background:rgba(224,69,60,.55)"></div>
      </div>
    </div>

    <div data-copy-source style="width:min(560px,100%);display:flex;flex-direction:column;gap:2px">
      {#each dashboard.menu as item (item.id)}
        <div
          class="dash-row"
          role="button"
          tabindex="0"
          data-testid="dashboard-menu-row"
          data-menu-id={item.id}
          onclick={() => pick(item.id)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") pick(item.id);
          }}
          style="display:grid;grid-template-columns:26px 1fr auto;align-items:center;padding:clamp(1px,.55vh,7px) 12px;border-radius:4px;cursor:pointer;font-size:clamp(12px,2.5vh,17px);line-height:1.35;color:#e0453c"
        >
          {#if item.icon === "spider-mask"}
            <span
              style="width:14px;height:18px;background:#ff4a4a;-webkit-mask:url(/assets/spiderman.svg) center/contain no-repeat;mask:url(/assets/spiderman.svg) center/contain no-repeat;display:block"
            ></span>
          {:else}
            <span style="opacity:.85">{item.icon}</span>
          {/if}
          <span>
            {#if item.invert}<span style="background:#e0453c;color:#0b0f14"
                >{item.label.slice(0, item.invert.length)}</span
              >{item.label.slice(item.invert.length)}{:else}{item.label}{/if}
          </span>
          <span style="color:#5fc6b4">{item.hotkey}</span>
        </div>
      {/each}
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
      <div style="font-size:clamp(11px,2.2vh,14px);color:rgba(224,69,60,.9)">{dashboard.footer.syncLine}</div>
    </div>
  </div>
</div>

<style>
  .dash-row:hover {
    background: rgba(224, 69, 60, 0.1);
  }
</style>
