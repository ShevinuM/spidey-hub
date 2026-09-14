// Maps a grep-index path (or search result path) to the view it should open
// when Enter is pressed on that row in GrepOverlay.
import type { ViewId } from "../../../common/lib/views";

/** Grep overlay Enter-routing: real-index paths are matched by segment-anchored file/dir names first; bare-word alternates below only apply to paths outside `src/` and `tests/`. */
export function grepPathToView(path: string): ViewId | null {
  if (/(^|\/)content\/personnel\/|(^|\/)EmploymentRecords\.svelte$/.test(path)) return "employment";
  if (/(^|\/)content\/repositories\/|(^|\/)Repositories\.svelte$/.test(path)) return "repositories";
  if (/(^|\/)Wallpaper\.svelte$/.test(path)) return "retina-v";
  if (/(^|\/)Profile\.svelte$/.test(path)) return "profile";

  if (!/^(src|tests)\//.test(path)) {
    if (/projects|Lazygit/.test(path)) return "repositories";
    if (/xp|Yazi/.test(path)) return "employment";
    if (/Tracker|Radar|subjects/.test(path)) return "retina-v";
    if (/info/i.test(path)) return "profile";
  }
  return null;
}
