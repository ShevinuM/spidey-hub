// Per-extension SVG file icons (Material Icon Theme style), resolved at
// generate time by scripts/generate.mjs into src/generated/file-icons.json —
// only the icons this site actually shows, never material-file-icons'
// full set. Folder/caret glyphs are drawn inline by each caller and never
// go through this lookup.
import fileIcons from "../../generated/file-icons.json";

/** Exact filename match wins (some names carry their own icon distinct from
 * a generic same-extension file, e.g. "package.json" vs any other ".json");
 * otherwise the lowercased extension; otherwise the generic file glyph. */
export function iconSvgForPath(path: string): string {
  const name = path.split("/").pop() ?? path;
  const byName = (fileIcons.byName as Record<string, string>)[name];
  if (byName) return fileIcons.icons[byName as keyof typeof fileIcons.icons];

  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const byExt = ext ? (fileIcons.byExt as Record<string, string>)[ext] : undefined;
  const iconName = byExt ?? fileIcons.fallback;
  return fileIcons.icons[iconName as keyof typeof fileIcons.icons];
}
