// Per-letter tilt/rise geometry for Dashboard.svelte's SPIDEY-HUB wordmark:
// an own arched rendering, never Marvel's actual logo artwork.

const WORDMARK_MAX_ANGLE = 16; // degrees the outermost letters tilt
const WORDMARK_ARCH_PX = 10; // dome rise at the center letter

export interface WordmarkChar {
  ch: string;
  style: string;
}

export function wordmarkChars(title: string): WordmarkChar[] {
  return title.split("").map((ch, i, arr) => {
    const n = arr.length;
    const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0; // -1..1 across the word
    const angle = t * WORDMARK_MAX_ANGLE;
    const rise = (1 - t * t) * WORDMARK_ARCH_PX;
    return { ch, style: `transform:translateY(${(-rise).toFixed(2)}px) rotate(${angle.toFixed(2)}deg)` };
  });
}
