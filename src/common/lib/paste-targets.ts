// A stack, not a single slot, since one target can open on top of another (e.g. a rename prompt over the grep overlay) and closing it must hand control back to what's beneath.

export interface PasteTarget {
  id: string;
  insert: (text: string) => void;
}

const stack: PasteTarget[] = [];

/** Registers `target` as the new top of the stack, replacing any existing entry with the same `id`. */
export function pushPasteTarget(target: PasteTarget): void {
  const existingIdx = stack.findIndex((t) => t.id === target.id);
  if (existingIdx !== -1) stack.splice(existingIdx, 1);
  stack.push(target);
}

/** Removes `id`'s entry wherever it sits in the stack, so an out-of-order teardown never disturbs the entries above it. */
export function removePasteTarget(id: string): void {
  const idx = stack.findIndex((t) => t.id === id);
  if (idx !== -1) stack.splice(idx, 1);
}

/** The current topmost registered target, or `null` if nothing is active. */
export function getActivePasteTarget(): PasteTarget | null {
  return stack.length ? stack[stack.length - 1] : null;
}
