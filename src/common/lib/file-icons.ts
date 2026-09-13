// Per-extension SVG icons, resolved at generate time into src/generated/file-icons.json.
import fileIcons from "../../generated/file-icons.json";

/** Resolves an icon by exact filename first, then by extension, then the generic fallback. */
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
