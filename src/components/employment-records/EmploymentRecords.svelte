<script lang="ts">
  // Employment Records view (v2) — flat, newest-first list of employment
  // records + a service-history timeline + a live-following file preview.
  // Rebuilt from scratch per UI-Mockups/builds-page-design-review/
  // Personnel.dc.html + Personnel-Panel-Changes.md, replacing the old
  // hierarchical drill-down file browser (tree/`../`/`f`-filter) this
  // folder used to hold — see docs/changes/employment-records-v2.md for the
  // full before/after diff. Decision 12 (PLAN.md): built directly in the
  // target orchestrator + state-class + panel-children pattern (no
  // relocation step), since the old component's entire reactive core (the
  // depth-generic tree walker) is exactly what this rebuild deletes.
  //
  // Keyboard model (Decision 7): j/k/arrows move the selection; the preview
  // panel and timeline both follow it live; Enter is a harmless no-op (still
  // consumed, so it never falls through to Terminal.svelte) — there is no
  // drill-down and no embedded editor to open from this flat list anymore.
  import type { CollectionEntry } from "astro:content";
  import type { PersonnelData } from "../../lib/data";
  import { EmploymentRecordsState } from "./employmentRecordsState.svelte";
  import RecordsPanel from "./RecordsPanel.svelte";
  import TimelinePanel from "./TimelinePanel.svelte";
  import PreviewPanel from "./PreviewPanel.svelte";

  type RoleEntry = CollectionEntry<"personnel">;

  interface Props {
    personnel: PersonnelData;
    personnelEntries: RoleEntry[];
    /** See PaneTree.svelte's own header comment (multi-instance
     * data-copy-source/paste-target gating). */
    isFocused: boolean;
    /** `PORTFOLIO_FIXTURES=1`, threaded through as the same boolean
     * Repositories' own `fixtureMode` prop carries (PaneTree.svelte reuses
     * `repositoriesFixtureMode` for both — one flag, two prop names,
     * matching that file's existing "same flag, per-feature name"
     * convention). Gates the timeline's infinite spin/rspin/spark/dash
     * keyframe animations to `none` for deterministic goldens. */
    fixtureMode: boolean;
  }

  const { personnel, personnelEntries, isFocused, fixtureMode }: Props = $props();

  const state = new EmploymentRecordsState(
    () => personnel,
    () => personnelEntries,
    () => fixtureMode,
  );

  /** Kept for API parity with Repositories/HelpView's own exported
   * `isEditorOpen`/`runEditorExCommand` (Terminal.svelte calls both
   * optionally via `bind:this`, see its own `LeafRef`-shaped interface) —
   * always trivial here since this page never opens an embedded editor. */
  export function isEditorOpen(): boolean {
    return false;
  }
  export function runEditorExCommand(_cmd: string): { recognized: boolean; error?: string } {
    return { recognized: false };
  }
  export function handleKey(e: KeyboardEvent): boolean {
    return state.handleKey(e);
  }
</script>

<div style="flex:1;min-height:0;display:flex">
  <div style="flex:1;min-height:0;padding:26px">
    <div style="position:relative;width:100%;height:100%;display:flex;font-size:12.5px">
      <div style="position:absolute;left:-10px;top:-10px;z-index:8;width:22px;height:22px;border:1px solid rgba(224,69,60,.6);border-radius:3px;background:rgba(10,14,19,.97);box-shadow:0 0 14px rgba(224,69,60,.25);display:flex;align-items:center;justify-content:center">
        <img src="/assets/spider-glyph-red.svg" alt="" aria-hidden="true" style="width:13px;height:13px;display:block" />
      </div>
      <div style="position:absolute;right:-10px;top:-10px;z-index:8;width:22px;height:22px;border:1px solid rgba(74,159,224,.55);border-radius:3px;background:rgba(10,14,19,.97);box-shadow:0 0 14px rgba(74,159,224,.2);display:flex;align-items:center;justify-content:center">
        <img src="/assets/spider-glyph-blue.svg" alt="" aria-hidden="true" style="width:13px;height:13px;display:block" />
      </div>
      <div style="position:absolute;left:-10px;bottom:-10px;z-index:8;width:22px;height:22px;border:1px solid rgba(95,198,180,.5);border-radius:3px;background:rgba(10,14,19,.97);display:flex;align-items:center;justify-content:center">
        <img src="/assets/spider-glyph-teal.svg" alt="" aria-hidden="true" style="width:13px;height:13px;display:block;opacity:.9" />
      </div>
      <div style="position:absolute;right:-10px;bottom:-10px;z-index:8;width:22px;height:22px;border:1px solid rgba(217,176,74,.5);border-radius:3px;background:rgba(10,14,19,.97);display:flex;align-items:center;justify-content:center">
        <img src="/assets/spider-glyph-gold.svg" alt="" aria-hidden="true" style="width:13px;height:13px;display:block;opacity:.95" />
      </div>

      <RecordsPanel {state} {isFocused} />
      <TimelinePanel {state} />
      <PreviewPanel {state} {isFocused} />
    </div>
  </div>
</div>
