// Shared paste-buffer store (PLAN.md Phase 3 item 10 "Yanks write to a NEW
// shared paste-buffer module"). A single module-level variable, not a
// per-component Svelte store — every importer (Editor.svelte today; PLAN.md
// Phase 5's tmux copy-mode overlay, `Ctrl-b [`/`Ctrl-b ]`, tomorrow) shares
// the exact same in-memory buffer, exactly like tmux's own single
// paste-buffer stack (simplified here to one slot, not a stack, since
// nothing in this app's spec needs buffer history).
//
// Deliberately framework-free (no Svelte runes) so it works identically
// whether the caller is a `.svelte` component or a future plain-`.ts`
// module (e.g. a copy-mode helper) — callers that need reactivity wrap a
// read in their own `$state`/`$derived`.

export type PasteBufferKind = "char" | "line";

export interface PasteBufferEntry {
  text: string;
  kind: PasteBufferKind;
}

let buffer: PasteBufferEntry | null = null;

/** Records a new yank (or, eventually, copy-mode capture). `kind` mirrors
 * vim's own charwise/linewise register distinction — Phase 5's paste
 * (`Ctrl-b ]`) will use it to decide whether to insert the text inline or
 * as its own line. */
export function setPasteBuffer(text: string, kind: PasteBufferKind): void {
  buffer = { text, kind };
}

/** Returns the current buffer, or `null` if nothing has been yanked yet
 * this session. Always a fresh object read (never a live reference callers
 * could mutate out from under the store). */
export function getPasteBuffer(): PasteBufferEntry | null {
  return buffer ? { ...buffer } : null;
}

export function clearPasteBuffer(): void {
  buffer = null;
}

/** Best-effort system-clipboard mirror. Guarded for unavailability
 * (`navigator.clipboard` is missing in some headless/insecure contexts) and
 * for rejection (no clipboard permission) — a failed write must never throw
 * into the caller's key-handling path or surface as an unhandled promise
 * rejection in tests. */
export function writeToSystemClipboard(text: string): void {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
  navigator.clipboard.writeText(text).catch(() => {});
}
