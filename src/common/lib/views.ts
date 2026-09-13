// View-id plumbing shared by the router pages and Terminal.svelte; these are internal identifiers, never rendered as text directly.
import type { ProgramName } from "../engines/tmux/tmux";

export type ViewId = "home" | "repositories" | "employment" | "retina-v" | "profile" | "help";

/** Route path for each view id — used for pushState + popstate parsing. */
export const VIEW_ROUTES: Record<ViewId, string> = {
  home: "/",
  repositories: "/repositories",
  employment: "/employment",
  "retina-v": "/retina-v",
  profile: "/profile",
  help: "/help",
};

/** dashboard.yaml's menu ids (projects/xp/info/tracker) and the plainer route ids used everywhere else meet here — the one place the two vocabularies translate. */
const MENU_ID_TO_VIEW: Record<string, ViewId> = {
  projects: "repositories",
  xp: "employment",
  info: "profile",
  tracker: "retina-v",
  help: "help",
};

export function menuIdToView(menuId: string): ViewId | undefined {
  return MENU_ID_TO_VIEW[menuId];
}

export function pathToView(pathname: string): ViewId {
  const entry = (Object.entries(VIEW_ROUTES) as [ViewId, string][]).find(
    ([, path]) => path === pathname,
  );
  return entry ? entry[0] : "home";
}

/** Which status-bar window id is active for a given view; "home" is the one ViewId whose window id ("dashboard") doesn't match its own name. */
export function activeWindowId(view: ViewId): string {
  return view === "home" ? "dashboard" : view;
}

/** Inverse of activeWindowId's "home" special case, used by StatusBar's click-to-navigate handler; every other window id already equals its ViewId verbatim. */
export function windowIdToView(id: string): ViewId {
  return id === "dashboard" ? "home" : (id as ViewId);
}

// ProgramName (what a pane is running) and ViewId (a route) agree on every string except "home"/"dashboard" and "shell", which has no route since a shelled-in pane freezes the URL wherever it already was.

export function viewIdToProgram(view: ViewId): ProgramName {
  return view === "home" ? "dashboard" : (view as ProgramName);
}

/** `null` for "shell" — the one ProgramName with no corresponding route. */
export function programToViewId(program: ProgramName): ViewId | null {
  if (program === "shell") return null;
  return program === "dashboard" ? "home" : (program as ViewId);
}

/**
 * The tmux binding that switches to `view`, e.g. "C-b 1", looked up in `windowNumbers` rather than any fixed table so it always reflects the actual session state.
 *
 * `undefined` if that view's window isn't present (e.g. it was killed).
 */
export function viewToTmuxBinding(view: ViewId, windowNumbers: Record<string, number>): string | undefined {
  const number = windowNumbers[viewIdToProgram(view)];
  return number === undefined ? undefined : `C-b ${number}`;
}

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
