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
  // panel and timeline both follow it live; Enter opens the selected
  // record's role.md in the shared vim-lite Editor.svelte — the drill-down/
  // `f`-filter/`../` are what Decision 7 drops, not Enter's existing
  // open-in-editor behavior ("j/k/enter selection stays"). "Harmless-open"
  // (E1) describes why leaving this in is safe: the buffer is always
  // readonly, so it can never desync from the live preview/timeline.
  import type { CollectionEntry } from "astro:content";
  import type { PersonnelData } from "../../../common/lib/data";
  import Editor from "../../../common/components/editor/Editor.svelte";
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
  }

  const { personnel, personnelEntries, isFocused }: Props = $props();

  const state = new EmploymentRecordsState(
    () => personnel,
    () => personnelEntries,
  );

  /** API parity with Repositories.svelte's own exported `isEditorOpen`/
   * `runEditorExCommand` — real delegation now that this page embeds the
   * same shared Editor.svelte (see the state class's own doc comment for
   * why Enter opens it). */
  export function isEditorOpen(): boolean {
    return state.editorOpen;
  }
  export function runEditorExCommand(cmd: string): { recognized: boolean; error?: string } {
    if (!state.editorOpen || !state.editorRef) return { recognized: false };
    return state.editorRef.runExCommand(cmd);
  }
  export function handleKey(e: KeyboardEvent): boolean {
    return state.handleKey(e);
  }
</script>

{#if state.editorOpen}
  <Editor
    bind:this={state.editorRef}
    fileName={state.editorFileName}
    lines={state.editorLines}
    labels={personnel.editor}
    breadcrumbLeft={state.editorBreadcrumbLeft}
    breadcrumbRight={state.editorFileName}
    {isFocused}
    onClose={() => state.closeEditor()}
  />
{:else}
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
        <PreviewPanel {state} />
      </div>
    </div>
  </div>
{/if}
