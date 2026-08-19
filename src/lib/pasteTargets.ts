// Paste-target registry, designed so any text input can register itself
// without touching Terminal.svelte's paste handler. `Ctrl-b ]`
// (Terminal.svelte) inserts the shared paste buffer (src/lib/pasteBuffer.ts)
// into whichever text input is currently "active" — the grep query, the
// personnel filter, the status-bar rename prompt, or the cmdline box, each
// registering itself the same way.
//
// A STACK, not a single slot: more than one candidate target can be "open"
// at once (e.g. the grep overlay stays open underneath a status-bar rename
// prompt — the prompt owns the keyboard, so it must win, but closing it
// should hand control back to grep rather than leaving nothing registered).
// Each owner pushes on activation and pops itself by `id` on deactivation
// (not a blind pop) so an out-of-order teardown never removes someone else's
// entry — `getActivePasteTarget()` always returns the top of what's left.

export interface PasteTarget {
  id: string;
  insert: (text: string) => void;
}

const stack: PasteTarget[] = [];

/** Registers `target` as the new top of the stack. Callers own exactly one
 * slot each (keyed by `id`) — pushing the same id again just moves it to the
 * top rather than creating a duplicate entry. */
export function pushPasteTarget(target: PasteTarget): void {
  const existingIdx = stack.findIndex((t) => t.id === target.id);
  if (existingIdx !== -1) stack.splice(existingIdx, 1);
  stack.push(target);
}

/** Removes `id`'s entry wherever it sits in the stack — always call this on
 * teardown (component unmount / input deactivation), not a raw pop, so a
 * deeper entry closing out of order never disturbs the ones above it. */
export function removePasteTarget(id: string): void {
  const idx = stack.findIndex((t) => t.id === id);
  if (idx !== -1) stack.splice(idx, 1);
}

/** The current topmost registered target, or `null` if nothing is active. */
export function getActivePasteTarget(): PasteTarget | null {
  return stack.length ? stack[stack.length - 1] : null;
}
