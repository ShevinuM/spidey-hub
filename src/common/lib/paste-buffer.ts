// A single module-level buffer, not a per-component store, shared by every importer, and deliberately framework-free so a plain `.ts` caller can use it too.

export type PasteBufferKind = "char" | "line";

export interface PasteBufferEntry {
  text: string;
  kind: PasteBufferKind;
}

let buffer: PasteBufferEntry | null = null;

/** Records a new yank or copy-mode capture; `kind` decides whether paste inserts it inline or as its own line. */
export function setPasteBuffer(text: string, kind: PasteBufferKind): void {
  buffer = { text, kind };
}

/** Returns a fresh copy of the current buffer, or `null` if nothing has been yanked yet. */
export function getPasteBuffer(): PasteBufferEntry | null {
  return buffer ? { ...buffer } : null;
}

export function clearPasteBuffer(): void {
  buffer = null;
}

/** Best-effort system-clipboard mirror; a missing API or a rejected write must never throw into the caller's key-handling path. */
export function writeToSystemClipboard(text: string): void {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
  navigator.clipboard.writeText(text).catch(() => {});
}
