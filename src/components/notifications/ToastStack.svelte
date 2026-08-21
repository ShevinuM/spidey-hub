<script lang="ts">
  import type { NotificationsState } from "./notificationsState.svelte";
  import { SEVERITY_META } from "../../lib/notificationStore";
  import { STATUS_BAR_HEIGHT_PX } from "../../lib/layout";

  interface Props {
    state: NotificationsState;
  }

  const { state }: Props = $props();
</script>

<div
  style="position:fixed;right:16px;bottom:{STATUS_BAR_HEIGHT_PX +
    18}px;z-index:50;width:392px;display:flex;flex-direction:column-reverse;gap:9px;pointer-events:none"
>
  {#each state.toasts as t (t.id)}
    {@const meta = SEVERITY_META[t.sev]}
    <div
      data-testid="toast"
      data-severity={t.sev}
      data-toast-id={t.id}
      class="eh-toast"
      role="status"
      onmouseenter={() => state.holdToast(t.id)}
      onmouseleave={() => state.releaseToast(t.id)}
      style="position:relative;pointer-events:auto;background:rgba(10,11,14,.95);border:1px solid {meta.color};box-shadow:0 0 0 1px rgba(0,0,0,.65),0 12px 34px rgba(0,0,0,.6),0 0 26px {meta.glow};animation:toastIn .34s cubic-bezier(.2,1.35,.4,1) both"
    >
      <span
        data-testid="toast-strand"
        style="position:absolute;left:26px;top:-13px;width:1px;height:13px;transform-origin:top;background:linear-gradient(180deg,rgba(255,255,255,0),{meta.color});animation:strand .3s ease both"
      ></span>
      <div style="display:flex;align-items:stretch">
        <div style="width:26px;display:grid;place-items:center;background:{meta.color};color:#0a0a0a;font:800 11px/1 'JetBrains Mono',monospace">
          {meta.glyph}
        </div>
        <div style="flex:1;min-width:0;padding:8px 9px 8px 10px;display:flex;flex-direction:column;gap:3px">
          <div style="display:flex;align-items:center;gap:7px">
            <span style="font:800 9px/1.4 'JetBrains Mono',monospace;letter-spacing:.14em;color:{meta.color}">{meta.label}</span>
            <span style="font:400 9px/1.4 'JetBrains Mono',monospace;color:rgba(255,255,255,.3)">{t.src}</span>
          </div>
          <div style="font:700 12px/1.4 'JetBrains Mono',monospace;color:#eef1f3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{t.title}</div>
          <div style="font:400 10.5px/1.45 'JetBrains Mono',monospace;color:rgba(230,232,234,.5);text-wrap:pretty">{t.body}</div>
        </div>
      </div>
      <div style="height:2px;background:rgba(255,255,255,.06)">
        <div
          class="eh-toast-drain"
          style="height:2px;background:{meta.color};box-shadow:0 0 10px {meta.color};--drain-ms:{t.durationMs}ms"
        ></div>
      </div>
    </div>
  {/each}
</div>

<style>
  /* -global- keeps this keyframe resolvable from the inline `animation:`
     reference above: Svelte scopes a plain `@keyframes` declared in a
     component <style> block by renaming it, but never rewrites an
     `animation:` value written in markup, so the inline reference would
     otherwise point at a name that no longer exists. */
  @keyframes -global-toastIn {
    from {
      opacity: 0;
      transform: translateY(-18px) scaleY(0.9);
    }
    60% {
      opacity: 1;
      transform: translateY(3px) scaleY(1);
    }
    to {
      opacity: 1;
      transform: translateY(0) scaleY(1);
    }
  }
  @keyframes -global-strand {
    from {
      transform: scaleY(0);
    }
    to {
      transform: scaleY(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-testid="toast"],
    [data-testid="toast-strand"] {
      animation: none !important;
    }
  }
  /* PLAN.md Phase 5b: a toast can mount well before it is actually VISIBLE
     — BootSequence.svelte's opaque ~5.36s overlay covers the whole screen
     on a cold visit, but `state.toasts` (hence this `{#each}`) is populated
     at mount regardless. Without this, `toastIn`/`strand` (one-shot
     entrance animations) finish hidden behind the overlay and `drain`
     (this toast's own countdown) runs down — sometimes to empty — before
     the visitor ever sees it.
     `[data-testid="boot-sequence"]` is BootSequence.svelte's own overlay
     element, only ever mounted (`{#if booting}`) while its exported
     `isActive()` — `phase !== "ready"` — is true; its presence in the DOM
     is that exact boolean, just observed structurally instead of through
     the `bootActiveFn` closure Terminal.svelte threads into
     NotificationsState for the JS dismiss timer (notificationsState.svelte
     .ts's `armTimer`) — same signal, not a second one. `:has()` reaching
     up to `body` (a guaranteed common ancestor of the overlay and this
     component, which live under different subtrees of Terminal.svelte)
     needs `:global()` since it targets outside this component's own scope.
     Forcing `animation: none` while boot is active, rather than merely
     pausing, is deliberate: when this rule stops matching (the overlay
     unmounts), the resolved `animation-name` on each element flips from
     `none` to its real value in the same style recalc — a value CHANGE,
     which the spec defines as starting a brand-new animation instance.
     That is what makes all three animations begin together, fresh, at the
     exact instant the toast becomes visible, with no extra JS
     coordination. A returning visitor (boot-seen already set) never
     mounts the overlay at all, so this selector never matches and nothing
     about today's immediate-play behavior changes for that path. */
  :global(body:has([data-testid="boot-sequence"])) [data-testid="toast"],
  :global(body:has([data-testid="boot-sequence"])) [data-testid="toast-strand"],
  :global(body:has([data-testid="boot-sequence"])) .eh-toast-drain {
    animation: none !important;
  }
  /* `drain` is referenced from within THIS <style> block's own
     `.eh-toast-drain` rule below, not from an inline `style=` attribute, so
     Svelte's normal scoping rewrites both the declaration and the
     reference — it already resolves and stays plain (not `-global-`). */
  @keyframes drain {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }
  /* Base declarations for properties a :hover rule below also sets are kept
     out of each element's inline `style` on purpose — an inline style
     declaration always wins the cascade over a stylesheet rule for the same
     property (short of `!important`), so a hover rule can only ever take
     effect on a property the inline style never touches. This mirrors the
     row/tab hover convention already used in Repositories.svelte, Dashboard.svelte
     and EmploymentRecords.svelte. */
  .eh-toast-drain {
    animation: drain var(--drain-ms) linear forwards;
  }
  .eh-toast:hover .eh-toast-drain {
    animation-play-state: paused;
  }
</style>
