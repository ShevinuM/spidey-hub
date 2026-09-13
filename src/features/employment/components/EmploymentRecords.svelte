<script lang="ts">
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
