// The single composition point for the Terminal.svelte prop bag: every route
// page calls loadTerminalProps() instead of constructing data itself, so the
// loader set lives in one place rather than being repeated six times.
import { getCollection } from "astro:content";
import { getSite, getTracker, getCmdline, getChooseTree } from "../common/lib/data";
import { getCommitsByRepo } from "../common/lib/commits";
import { getDashboard } from "../features/dashboard/lib/data";
import { getRepositories } from "../features/repositories/lib/data";
import { getPersonnel } from "../features/employment/lib/data";
import { getGrep } from "../features/grep/lib/data";
import { getHelpSearch, buildHelp } from "../features/help/lib/data";
import { getShell } from "../features/shell-fs/lib/data";
import { buildProfile } from "../features/profile/lib/data";
import { buildNotifications } from "../features/notifications/lib/data";
import { buildBoot } from "../features/boot/lib/data";

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
