// The single composition point for the Terminal.svelte prop bag: every route
// page calls loadTerminalProps() instead of constructing data itself, so the
// loader set lives in one place rather than being repeated six times.
import { getCollection } from "astro:content";
import { getSite, getDashboard, getTracker, getRepositories, getPersonnel, getGrep, getCmdline, getHelpSearch, getShell, getChooseTree, buildProfile, buildHelp, buildNotifications, buildBoot } from "../common/lib/data";
import { getCommitsByRepo } from "../common/lib/commits";

/** Builds every prop Terminal.svelte takes except `initialView`, which stays
 * per-route. The return type is inferred so a dropped or renamed field fails
 * `astro check` at the page's `{...props}` spread. */
export async function loadTerminalProps() {
  const projects = await getCollection("repositories");
  return {
    site: getSite(),
    dashboard: getDashboard(),
    tracker: getTracker(),
    repositories: getRepositories(),
    personnel: getPersonnel(),
    grep: getGrep(),
    cmdline: getCmdline(),
    helpSearch: getHelpSearch(),
    shell: getShell(),
    chooseTree: getChooseTree(),
    projects,
    personnelEntries: await getCollection("personnel"),
    profile: buildProfile((await getCollection("profile"))[0]),
    help: buildHelp(await getCollection("help")),
    notifications: buildNotifications(await getCollection("notifications")),
    boot: buildBoot(await getCollection("boot")),
    commitsByRepo: getCommitsByRepo(projects),
    // Server-only read: the pages run in Node at build time, so this never
    // reaches the client bundle.
    notificationsFixtureMode: process.env.PORTFOLIO_FIXTURES === "1",
  };
}
