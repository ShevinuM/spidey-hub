<script lang="ts">
  // Harness-only wrapper: mounts Dashboard.svelte alone, supplying the
  // onMount-flipped hydration-ready marker every harness wrapper here
  // carries (see HelpHarness/NotificationsHarness's own header comments) —
  // the harness route itself cannot express this: `.astro` frontmatter runs
  // server-side only, so a bare direct `<Dashboard client:load {...} />` in
  // src/pages/harness/[feature].astro would have no way to signal once
  // hydration has actually completed. Unlike BootSequence.svelte (whose own
  // `data-boot-running` flag, flipped inside its `run()`, already serves as
  // that signal for boot's harness — see BootPage's own header comment),
  // Dashboard.svelte ships no such marker and must not gain one: it is
  // moved-verbatim production code, and adding test-only markup to it would
  // rewrite code this migration only ever relocates. This wrapper is test
  // support only (lives beside its own harness spec, not in this feature's
  // real `components/` tree), so it carries the marker instead.
  //
  // Synthetic props: in the real app, `isFocused`/`windowNumbers`/
  // `paneCount`/`onSelect` all come from live tmux state that
  // Terminal.svelte/PaneTree.svelte own — exactly what a kernel-free harness
  // excludes. Fixed synthetic values stand in:
  //   - `isFocused: true` — the only mounted instance, so it IS the focused
  //     one (gates `data-copy-source`, not asserted by this harness's spec).
  //   - `windowNumbers` — the real window-id -> live-window-number mapping
  //     asserted by src/features/dashboard/tests/ui/e2e/dashboard.spec.ts
  //     and documented in src/common/lib/views.ts's own site.yaml-sourced
  //     table (dashboard=0, repositories=1, employment=2, retina-v=3,
  //     profile=4, help=5), so the hotkey column renders the true bindings
  //     rather than blank cells. Keyed by ProgramName (viewToTmuxBinding's
  //     lookup key), not by ViewId — "home"'s window id is "dashboard".
  //   - `paneCount: 6` — any fixed integer; the spec asserts through it via
  //     `dashboard.footer.syncLineTemplate`, not against live tmux state.
  //   - `onSelect` — a no-op. The harness spec deliberately does NOT assert
  //     row-navigation: in the real app, PaneTree.svelte supplies this
  //     callback and Terminal.svelte owns the window switch, neither of
  //     which exists here. This wrapper only proves what Dashboard.svelte
  //     itself renders, not what the kernel does with a selection.
  import { onMount } from "svelte";
  import Dashboard from "../../../components/Dashboard.svelte";
  import type { DashboardData } from "../../../../../common/lib/data";

  interface Props {
    dashboard: DashboardData;
  }

  const { dashboard }: Props = $props();

  const WINDOW_NUMBERS: Record<string, number> = {
    dashboard: 0,
    repositories: 1,
    employment: 2,
    "retina-v": 3,
    profile: 4,
    help: 5,
  };

  /** True only once this island has actually hydrated — same race
   * HelpHarness.svelte's/NotificationsHarness.svelte's own `ready` flags
   * guard against: the server-rendered HTML (wordmark, menu rows, footer
   * line) is present before `client:load`'s JS runs, so a spec reading
   * those values immediately after navigation would otherwise pass on
   * static markup alone without proving hydration occurred. `onMount` only
   * ever runs client-side, after mount, so this flips exactly once
   * hydration is done. */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
</script>

<Dashboard {dashboard} isFocused={true} windowNumbers={WINDOW_NUMBERS} paneCount={6} onSelect={() => {}} />
<div data-testid="dashboard-harness-ready" data-ready={ready}></div>
