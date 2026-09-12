// Pure, rune-free rendering helpers for Editor.svelte's line/segment
// display — extracted during the folder+state-class relocation refactor.
// Editor's own `EditorState` class (editorState.svelte.ts) needs `lineText`
// for its `rawLines` derived, and `EditorBuffer.svelte` needs all three for
// per-segment markup; none of them close over reactive state, so they live
// here rather than as component-scoped functions or class methods.
import type { TokenSpan } from "../../lib/repo-tree";

/** Plain text (docs, flat code fallback), or a tokenized code line —
 * `[paletteIndex, text]` runs resolved against the caller's own palette.
 * Either way this reconstructs the plain text every vim motion/search/yank
 * operates on, so the engine never has to know which form a given line
 * came in as. */
export function lineText(t: string | TokenSpan[]): string {
  return typeof t === "string" ? t : t.map(([, text]) => text).join("");
}

/** Cursor/selection/search-match style precedence for one rendered
 * segment — cursor beats selection beats search-match beats a tokenized
 * palette color. */
export function segStyle(cls: string, color?: string): string | undefined {
  if (cls.includes("cursor")) return "background:#e0453c;color:#0b0f14";
  if (cls.includes("sel")) return "background:rgba(224,69,60,.22);color:#f4ece9";
  if (cls.includes("match")) return "background:rgba(95,198,180,.35);color:#eafaf6";
  if (color) return `color:${color}`;
  return undefined;
}

/** Same precedence as segStyle — one testid per segment, for e2e
 * assertions ("v/V selection highlight appears"). */
export function segTestId(cls: string): string | undefined {
  if (cls.includes("cursor")) return "editor-cursor";
  if (cls.includes("sel")) return "editor-selection";
  if (cls.includes("match")) return "editor-search-match";
  return undefined;
}
