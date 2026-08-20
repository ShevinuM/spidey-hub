<script lang="ts">
  import type { NotificationsState } from "./notificationsState.svelte";
  import { dismiss, markAllRead, markSpam, toggleRead } from "../../lib/notificationStore";

  interface Props {
    state: NotificationsState;
  }

  const { state }: Props = $props();
</script>

<div
  data-testid="notifications-panel"
  style="position:fixed;top:66px;right:16px;z-index:70;width:452px;max-height:calc(100vh - 130px);display:flex;flex-direction:column;background:rgba(9,10,13,.94);backdrop-filter:blur(16px) saturate(1.15);border:1px solid rgba(229,72,77,.4);box-shadow:0 0 0 1px rgba(0,0,0,.7),0 26px 70px rgba(0,0,0,.75),0 0 60px rgba(229,72,77,.10);animation:panelIn .18s cubic-bezier(.2,.9,.3,1) both"
>
  <div
    style="position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px 9px 12px;border-bottom:1px solid rgba(229,72,77,.28);background:linear-gradient(180deg,rgba(229,72,77,.10),rgba(229,72,77,.02)),repeating-linear-gradient(45deg,rgba(255,255,255,.028) 0 1px,transparent 1px 9px),repeating-linear-gradient(-45deg,rgba(255,255,255,.028) 0 1px,transparent 1px 9px);overflow:hidden"
  >
    <div style="display:flex;align-items:center;gap:8px;min-width:0">
      <span style="display:inline-block;padding:2px 6px;background:#e5484d;color:#0a0a0a;font:800 10px/1.4 'JetBrains Mono',monospace;letter-spacing:.06em"
        >{state.ui.badge}</span
      >
      <span style="font:700 11px/1.4 'JetBrains Mono',monospace;letter-spacing:.16em;color:#ffd9db;text-transform:uppercase">{state.ui.title}</span>
      <span style="font:400 10px/1.4 'JetBrains Mono',monospace;color:rgba(255,255,255,.32)">{state.ui.version}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font:400 10px/1.4 'JetBrains Mono',monospace;color:#4fd1c5;opacity:.75">{state.feedStatus}</span>
      <button
        class="eh-close"
        data-testid="notifications-close"
        onclick={() => state.togglePanel()}
        style="width:20px;height:20px;display:grid;place-items:center;background:transparent;font:700 10px/1 'JetBrains Mono',monospace;cursor:pointer"
        >{state.ui.closeGlyph}</button
      >
    </div>
    <span
      style="position:absolute;left:0;bottom:0;width:34%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,92,102,.85),transparent);pointer-events:none;animation:{state.fixtureMode
        ? 'none'
        : 'sweep 3.6s linear infinite'}"
    ></span>
  </div>

  <div style="display:flex;align-items:stretch;gap:1px;padding:6px 8px 0;background:rgba(255,255,255,.015)">
    {#each state.tabDefs as t (t.id)}
      <button
        class="eh-tab"
        data-testid="notifications-tab"
        data-tab={t.id}
        data-active={state.tab === t.id}
        onclick={() => (state.tab = t.id)}
        style="flex:1;padding:6px 4px;background:{state.tab === t.id
          ? '#e5484d'
          : 'rgba(255,255,255,.03)'};color:{state.tab === t.id
          ? '#0a0a0a'
          : 'rgba(255,255,255,.45)'};border:1px solid {state.tab === t.id
          ? '#e5484d'
          : 'rgba(255,255,255,.10)'};border-bottom:none;font:700 9.5px/1.3 'JetBrains Mono',monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px"
      >
        <span>{t.label}</span>
        <span style="opacity:.75;font-weight:400">{t.count}</span>
      </button>
    {/each}
  </div>

  <div style="flex:1;min-height:120px;overflow-y:auto;border-top:1px solid rgba(255,255,255,.08)">
    {#if state.tab === "spam"}
      <div
        style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:rgba(232,176,75,.07);border-bottom:1px solid rgba(232,176,75,.18);font:400 10px/1.4 'JetBrains Mono',monospace;color:#e8b04b"
      >
        <span>⌗</span><span>{state.ui.spamBanner}</span>
      </div>
    {/if}
    {#each state.rows as r (r.id)}
      <div
        class="eh-row"
        data-testid="notification-row"
        data-severity={r.sev}
        data-notification-id={r.id}
        style="position:relative;display:flex;align-items:stretch;border-bottom:1px solid rgba(255,255,255,.05);--row-bg:{r.rowBg}"
      >
        <div style="width:2px;background:{r.bar}"></div>
        <div style="width:26px;display:flex;align-items:flex-start;justify-content:center;padding-top:11px;font:700 10px/1 'JetBrains Mono',monospace;color:{r.color};opacity:{r.dim}">
          {r.glyph}
        </div>
        <div style="flex:1;min-width:0;padding:9px 8px 10px 0;display:flex;flex-direction:column;gap:3px;opacity:{r.dim}">
          <div style="display:flex;align-items:center;gap:7px">
            <span style="padding:1px 5px;border:1px solid {r.color};color:{r.color};font:700 8.5px/1.5 'JetBrains Mono',monospace;letter-spacing:.1em"
              >{r.sevLabel}</span
            >
            <span style="font:{r.titleWeight} 12px/1.35 'JetBrains Mono',monospace;color:#eef1f3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
              >{r.title}</span
            >
          </div>
          <div style="font:400 10.5px/1.5 'JetBrains Mono',monospace;color:rgba(230,232,234,.55);text-wrap:pretty">{r.body}</div>
          <div style="display:flex;align-items:center;gap:8px;font:400 9.5px/1.4 'JetBrains Mono',monospace;color:rgba(255,255,255,.3)">
            <span>{r.src}</span><span>·</span><span>{r.ago}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;justify-content:center;gap:4px;padding:0 8px 0 4px">
          <button
            class="eh-toggle-read"
            data-testid="notification-toggle-read"
            onclick={() => state.mutate((s) => toggleRead(s, r.id))}
            title={r.readTitle}
            style="width:22px;height:22px;display:grid;place-items:center;background:transparent;color:{r.color};font:700 10px/1 'JetBrains Mono',monospace;cursor:pointer"
            >{r.readGlyph}</button
          >
          {#if r.showSpamAction}
            <button
              class="eh-mark-spam"
              data-testid="notification-mark-spam"
              onclick={() => state.mutate((s) => markSpam(s, r.id))}
              title={state.ui.spamActionTitle}
              style="width:22px;height:22px;display:grid;place-items:center;background:transparent;color:#e8b04b;font:700 10px/1 'JetBrains Mono',monospace;cursor:pointer"
              >{state.ui.spamActionGlyph}</button
            >
          {/if}
          <button
            class="eh-dismiss"
            data-testid="notification-dismiss"
            onclick={() => state.mutate((s) => dismiss(s, r.id))}
            title={r.dismissTitle}
            style="width:22px;height:22px;display:grid;place-items:center;background:transparent;font:700 10px/1 'JetBrains Mono',monospace;cursor:pointer"
            >{r.dismissGlyph}</button
          >
        </div>
      </div>
    {/each}
    {#if state.rows.length === 0}
      <div data-testid="notifications-empty" style="padding:38px 16px;display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center">
        <span style="font-size:18px;opacity:.35">{state.ui.emptyGlyph}</span>
        <span style="font:400 11px/1.5 'JetBrains Mono',monospace;color:rgba(255,255,255,.35)">{state.emptyLine}</span>
      </div>
    {/if}
  </div>

  <div
    style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-top:1px solid rgba(229,72,77,.24);background:rgba(229,72,77,.05)"
  >
    <div style="display:flex;align-items:center;gap:9px;font:400 9.5px/1.4 'JetBrains Mono',monospace;color:rgba(255,255,255,.34)">
      {#each state.ui.footerHints as hint (hint.key)}
        <span><span style="color:#4fd1c5">{hint.key}</span> {hint.label}</span>
      {/each}
    </div>
    <button
      class="eh-mark-all-read"
      data-testid="notifications-mark-all-read"
      onclick={() => state.mutate((s) => markAllRead(s))}
      style="padding:4px 9px;border:1px solid rgba(79,209,197,.4);font:700 9.5px/1.3 'JetBrains Mono',monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer"
      >{state.ui.markAllRead}</button
    >
  </div>
</div>

<style>
  @keyframes panelIn {
    from {
      opacity: 0;
      transform: translateY(-10px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes sweep {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(220%);
    }
  }
  /* Base declarations for properties a :hover rule below also sets are kept
     out of each element's inline `style` on purpose — an inline style
     declaration always wins the cascade over a stylesheet rule for the same
     property (short of `!important`), so a hover rule can only ever take
     effect on a property the inline style never touches. This mirrors the
     row/tab hover convention already used in Builds.svelte, Dashboard.svelte
     and Personnel.svelte. */
  .eh-tab:hover {
    filter: brightness(1.25);
  }
  .eh-row {
    background: var(--row-bg);
  }
  .eh-row:hover {
    background: rgba(255, 255, 255, 0.045);
  }
  .eh-close {
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.55);
  }
  .eh-close:hover {
    border-color: #e5484d;
    color: #ff5c66;
  }
  .eh-toggle-read {
    border: 1px solid rgba(255, 255, 255, 0.12);
    opacity: 0.55;
  }
  .eh-toggle-read:hover {
    opacity: 1;
    border-color: rgba(255, 255, 255, 0.4);
  }
  .eh-mark-spam {
    border: 1px solid rgba(255, 255, 255, 0.12);
    opacity: 0.55;
  }
  .eh-mark-spam:hover {
    opacity: 1;
    border-color: rgba(255, 255, 255, 0.4);
  }
  .eh-dismiss {
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.6);
    opacity: 0.55;
  }
  .eh-dismiss:hover {
    opacity: 1;
    border-color: #e5484d;
    color: #ff5c66;
  }
  .eh-mark-all-read {
    background: transparent;
    color: #4fd1c5;
  }
  .eh-mark-all-read:hover {
    background: #4fd1c5;
    color: #06110f;
  }
</style>
