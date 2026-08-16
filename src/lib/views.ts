// View-id plumbing shared by the router pages and Terminal.svelte. Not
// copy — these are internal identifiers (route paths, dashboard.yaml menu
// ids, site.yaml status-bar window ids), never rendered as text directly.
export type ViewId = "home" | "builds" | "personnel" | "retina-v" | "profile";

/** Route path for each view id — used for pushState + popstate parsing. */
export const VIEW_ROUTES: Record<ViewId, string> = {
  home: "/",
  builds: "/builds",
  personnel: "/personnel",
  "retina-v": "/retina-v",
  profile: "/profile",
};

/**
 * dashboard.yaml menu rows use the prototype's original ids
 * (projects/xp/info/tracker — Homepage.dc.html `keys`/`labels`); the
 * status-bar window list (site.yaml) and our routes use the plainer
 * builds/personnel/profile/retina-v ids. This is the one place the two
 * vocabularies meet.
 */
const MENU_ID_TO_VIEW: Record<string, ViewId> = {
  projects: "builds",
  xp: "personnel",
  info: "profile",
  tracker: "retina-v",
};

export function menuIdToView(menuId: string): ViewId | undefined {
  return MENU_ID_TO_VIEW[menuId];
}

/** Global dashboard hotkeys (only active from the "home" view). */
const HOTKEY_TO_VIEW: Record<string, ViewId> = {
  b: "builds",
  p: "builds",
  x: "personnel",
  i: "profile",
  t: "retina-v",
};

export function hotkeyToView(key: string): ViewId | undefined {
  return HOTKEY_TO_VIEW[key];
}

export function pathToView(pathname: string): ViewId {
  const entry = (Object.entries(VIEW_ROUTES) as [ViewId, string][]).find(
    ([, path]) => path === pathname,
  );
  return entry ? entry[0] : "home";
}

/** Which status-bar window id (site.yaml) is active for a given view. */
export function activeWindowId(view: ViewId): string {
  return view === "home" ? "builds" : view;
}
