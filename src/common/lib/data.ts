// Build-time loader for the site's copy/labels yaml — every user-visible
// string that isn't part of a content collection lives in one of these
// files. Astro pages/layouts read this module and pass plain data down as
// props; Svelte islands never read the filesystem themselves. Kernel-owned
// yaml (site/cmdline/choosetree) lives in `src/common/content/`; a feature
// with its own bounded context keeps its yaml beside its own content (e.g.
// `src/features/help/content/help.yaml`); every other feature's yaml still
// lives in `src/data/` — every one of these is read from its own explicit
// `?raw` import below, one per file, not a glob.
//
// Each file is a static `?raw` import (inlined as a string by Vite at
// build time) rather than a runtime `node:fs` read relative to
// `import.meta.url`: Astro's static build bundles this module into
// `dist/.prerender/chunks/`, which moves it well away from `src/data/` on
// disk, so a `readFileSync(dirname(import.meta.url) + "../data/...")` path
// resolves under `dist/` and 404s (ENOENT) exactly once real pages start
// calling these getters. `?raw` imports have no such problem: Vite resolves
// and inlines the file content at the *import's* location during bundling,
// independent of where the chunk ends up at runtime.
import YAML from "yaml";
import type { CollectionEntry } from "astro:content";
import siteRaw from "../content/site.yaml?raw";
import dashboardRaw from "../../features/dashboard/content/dashboard.yaml?raw";
import trackerRaw from "../../data/tracker.yaml?raw";
import repositoriesRaw from "../../data/repositories.yaml?raw";
import grepRaw from "../../data/grep.yaml?raw";
import personnelRaw from "../../data/personnel.yaml?raw";
import helpRaw from "../../features/help/content/help.yaml?raw";
import bootRaw from "../../features/boot/content/boot.yaml?raw";
import cmdlineRaw from "../content/cmdline.yaml?raw";
import helpsearchRaw from "../../features/help/content/helpsearch.yaml?raw";
import notificationsRaw from "../../features/notifications/content/notifications.yaml?raw";
import shellRaw from "../../data/shell.yaml?raw";
import choosetreeRaw from "../content/choosetree.yaml?raw";

const RAW: Record<string, string> = {
  "site.yaml": siteRaw,
  "dashboard.yaml": dashboardRaw,
  "tracker.yaml": trackerRaw,
  "repositories.yaml": repositoriesRaw,
  "grep.yaml": grepRaw,
  "personnel.yaml": personnelRaw,
  "help.yaml": helpRaw,
  "boot.yaml": bootRaw,
  "cmdline.yaml": cmdlineRaw,
  "helpsearch.yaml": helpsearchRaw,
  "notifications.yaml": notificationsRaw,
  "shell.yaml": shellRaw,
  "choosetree.yaml": choosetreeRaw,
};

const cache = new Map<string, unknown>();

function loadYaml<T>(file: string): T {
  const cached = cache.get(file);
  if (cached !== undefined) return cached as T;
  const raw = RAW[file];
  if (raw === undefined) throw new Error(`src/common/lib/data.ts: no ?raw import registered for "${file}"`);
  const parsed = YAML.parse(raw) as T;
  cache.set(file, parsed);
  return parsed;
}

// ---------------------------------------------------------------------------
// site.yaml
// ---------------------------------------------------------------------------

export interface WindowEntry {
  number: number;
  id: string;
  name: string;
}

export interface StatusPrompts {
  renamePrefix: string;
  killWindowTemplate: string;
  killPaneTemplate: string;
  killLastWindowMessage: string;
  pasteEmptyMessage: string;
}

export interface CopyModeData {
  titlePrefix: string;
  titleTilde: string;
  hint: string;
  emptyText: string;
}

export interface SiteData {
  statusBar: {
    sessionTemplate: string;
    separator: string;
    windows: WindowEntry[];
    grepHint: string;
    rebootLabel: string;
    prompts: StatusPrompts;
  };
  copyMode: CopyModeData;
  mobileBlock: {
    heading: string;
    body: string;
    escapeHatchText: string;
    escapeHatchHref: string;
  };
}

export const getSite = (): SiteData => loadYaml<SiteData>("site.yaml");

// ---------------------------------------------------------------------------
// dashboard.yaml
// ---------------------------------------------------------------------------

export interface MenuEntry {
  id: string;
  icon: string;
  label: string;
  invert?: string;
}

export interface DashboardData {
  plate: { title: string };
  menu: MenuEntry[];
  footer: { syncLineTemplate: string; switchingTemplate: string };
}

export const getDashboard = (): DashboardData => loadYaml<DashboardData>("dashboard.yaml");

// ---------------------------------------------------------------------------
// notifications.yaml (chrome) + src/features/notifications/content/*.md (pool)
// ---------------------------------------------------------------------------

/** A notification pool entry (src/features/notifications/lib/notification-store.ts's `PoolEntry`,
 * re-declared here rather than imported so this build-time loader stays
 * framework/runtime agnostic — same convention every other *Data interface
 * in this file follows). */
export interface NotificationPoolEntry {
  id: string;
  sev: "alert" | "warn" | "info";
  title: string;
  body: string;
  src: string;
}

/** Builds the pool from the `notifications` content collection, sorted by
 * each entry's frontmatter `order` — the pool's array position feeds the
 * seeded per-visit pick (src/features/notifications/lib/notification-store.ts's `pickRandomUnseen`),
 * so this order must stay stable across a rebuild even though the loader's
 * own directory-read order isn't guaranteed to be. */
export const buildNotificationPool = (
  entries: CollectionEntry<"notifications">[],
): NotificationPoolEntry[] =>
  entries
    .slice()
    .sort((a, b) => a.data.order - b.data.order)
    .map((e) => ({ id: e.id, sev: e.data.sev, title: e.data.title, body: (e.body ?? "").trim(), src: e.data.src }));

export interface NotificationsFooterHint {
  key: string;
  label: string;
}

export interface NotificationsUi {
  bellTitle: string;
  badge: string;
  title: string;
  version: string;
  feedStatusUnread: string;
  feedStatusClear: string;
  closeGlyph: string;
  tabs: { inbox: string; alerts: string; archive: string; spam: string };
  spamBanner: string;
  emptyGlyph: string;
  empty: { inbox: string; alerts: string; archive: string; spam: string };
  readTitleMarkRead: string;
  readTitleMarkUnread: string;
  dismissTitleArchive: string;
  dismissTitleDelete: string;
  dismissGlyphArchive: string;
  dismissGlyphDelete: string;
  spamActionTitle: string;
  spamActionGlyph: string;
  footerHints: NotificationsFooterHint[];
  markAllRead: string;
}

export interface NotificationsData {
  ui: NotificationsUi;
  pool: NotificationPoolEntry[];
}

interface NotificationsChrome {
  ui: NotificationsUi;
}

export const buildNotifications = (entries: CollectionEntry<"notifications">[]): NotificationsData => {
  const { ui } = loadYaml<NotificationsChrome>("notifications.yaml");
  return { ui, pool: buildNotificationPool(entries) };
};

// ---------------------------------------------------------------------------
// tracker.yaml
// ---------------------------------------------------------------------------

export interface MapLabel {
  label: string;
  left: number;
  top: number;
}

export interface Subject {
  id: string;
  threat: "none" | "high";
  label: string;
  sig: string;
  leftFrac: number;
  topFrac: number;
}

export interface TrackerData {
  map: {
    title: string;
    capital: MapLabel;
    cities: MapLabel[];
    mountains: MapLabel[];
    forests: MapLabel[];
    rivers: MapLabel[];
    origin: { glyph: string; label: string };
  };
  commandBox: { commandLine: string; statusLine: string };
  hud: { left: string[]; right: string[] };
  subjects: Subject[];
}

export const getTracker = (): TrackerData => loadYaml<TrackerData>("tracker.yaml");

// ---------------------------------------------------------------------------
// src/features/profile/content/*.md
// ---------------------------------------------------------------------------

export interface ProfileField {
  label: string;
  value?: string | undefined;
  valuePrefix?: string | undefined;
  linkText?: string | undefined;
  linkHref?: string | undefined;
}

export interface ContactRow {
  icon: string;
  alt: string;
  text: string;
  href: string | null;
}

/** One EDUCATION entry (degree, school, location, dates) — both rows
 * sourced verbatim from the resume. */
export interface EducationRow {
  degree: string;
  school: string;
  loc: string;
  dates: string;
}

export interface ProfileData {
  header: { badge: string; fileClearance: string };
  title: { name: string; subtitle: string };
  images: {
    portrait: { alt: string; caption: string };
    field: { alt: string; caption: string };
    retinaV: { alt: string; caption: string };
  };
  fields: ProfileField[];
  /** The bio's heading (frontmatter) plus its paragraphs, split from the
   * content entry's markdown body on blank lines — the only bio block on
   * the page. */
  dossier: { heading: string; paragraphs: string[] };
  recordDatabase: { title: string; stats: { label: string; value: number }[] };
  cv: {
    title: string;
    fileLabel: string;
    meta: string;
    hintPrefix: string;
    hintKey: string;
    hintSuffix: string;
    href: string;
  };
  contact: { title: string; rows: ContactRow[] };
  education: { title: string; rows: EducationRow[] };
  signal: { label: string; coords: string; initialReadout: string };
}

/** Splits a markdown body into paragraphs on blank lines — the profile
 * entry's body holds only plain-prose paragraphs (no lists/headings), so
 * this needs no markdown rendering. */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export const buildProfile = (entry: CollectionEntry<"profile">): ProfileData => {
  const { dossierHeading, ...rest } = entry.data;
  return {
    ...rest,
    dossier: { heading: dossierHeading, paragraphs: splitParagraphs(entry.body ?? "") },
  };
};

// ---------------------------------------------------------------------------
// repositories.yaml
// ---------------------------------------------------------------------------

export interface RepoBrowserEntry {
  icon: string;
  name: string;
}

export interface RepoBrowserData {
  upEntry: RepoBrowserEntry;
  dirIcon: string;
  fileIcon: string;
  loadingText: string;
  errorText: string;
  /** Panel [2] before any repo has been opened — the tree browser has no
   * default content of its own. */
  emptyText: string;
}

/** Panel [3]'s virtual "all-projects" row — every
 * project's .md doc in one browsable tree, backed by
 * public/generated/repos/all-projects.json (fixtures/repos/all-projects.json
 * in a fixture build). Not a real repo: no branch to track, no commits. */
export interface AllProjectsData {
  name: string;
  branch: string;
  description: string;
}

export interface SpinnerData {
  label: string;
  frames: string[];
  ariaLabel: string;
}

export interface CommitBrowserData {
  errorText: string;
}

export interface FilePreviewData {
  loadingText: string;
  errorText: string;
  binaryText: string;
}

export interface EditorLabels {
  modeLabel: string;
  modeVisualLabel: string;
  modeVisualLineLabel: string;
  branch: string;
  breadcrumbSeparator: string;
  closePillLabel: string;
  tabIcon: string;
  topLabel: string;
  bottomLabel: string;
  percentTemplate: string;
  positionTemplate: string;
  searchPromptGlyph: string;
  cmdlinePromptGlyph: string;
  readonlyBellMessage: string;
  writeReadonlyMessage: string;
  notAnEditorCommandTemplate: string;
}

export interface RepositoriesData {
  panels: {
    status: { label: string };
    // Panel [2] is the tree browser — its caption is "<repo>" or
    // "<repo> @<sha8>" once a repo/commit is open.
    files: { label: string; subtitleTemplate: string };
    repos: { label: string };
    commits: { label: string; subtitleTemplate: string; authorInitials: string; localOnlyText: string };
    changes: { label: string; subtitleTemplate: string };
  };
  statusLine: {
    prefix: string;
    arrow: string;
    reposSuffix: string;
    mainLabel: string;
    lastPushTemplate: string;
    connectedLabel: string;
  };
  repoBrowser: RepoBrowserData;
  allProjects: AllProjectsData;
  spinner: SpinnerData;
  commitBrowser: CommitBrowserData;
  filePreview: FilePreviewData;
  editor: EditorLabels;
}

export const getRepositories = (): RepositoriesData => loadYaml<RepositoriesData>("repositories.yaml");

// ---------------------------------------------------------------------------
// grep.yaml
// ---------------------------------------------------------------------------

export interface GrepData {
  leftPane: { titlePrefix: string; titleTilde: string; promptIcon: string; cursorGlyph: string };
  modeLine: { liveGrep: string; repoFiles: string };
  loadingText: string;
  errorText: string;
  emptyStateTemplate: string;
  noResultsFile: string;
  rowPosTemplate: string;
  filePosTemplate: string;
  fileLinesTemplate: string;
  footer: { hintsLeft: string; closeHint: string };
}

export const getGrep = (): GrepData => loadYaml<GrepData>("grep.yaml");

// ---------------------------------------------------------------------------
// personnel.yaml
// ---------------------------------------------------------------------------

export interface PersonnelData {
  breadcrumb: string;
  /** Personnel collection top-level dir segment (org) -> 2-3 char row tag,
   * e.g. "memorial-university" -> "mun". See EmploymentRecords.svelte v2. */
  orgTags: Record<string, string>;
  index: {
    orgsLabel: string;
    longestLabel: string;
    yearsActiveLabel: string;
    longestSuffix: string;
    yearsActiveSeparator: string;
  };
  fileOwner: string;
  filePerms: string;
  badge: {
    recordsLeft: string;
    recordsRight: string;
    previewLeft: string;
    previewRight: string;
  };
  previewLineCountTemplate: string;
  editor: EditorLabels;
}

export const getPersonnel = (): PersonnelData => loadYaml<PersonnelData>("personnel.yaml");

// ---------------------------------------------------------------------------
// src/features/help/content/help.yaml + src/features/help/content/*.md
// ---------------------------------------------------------------------------

/** One keymap row: a short `name`, a plain-language one-line `desc`
 * (renders on its own line under `name` — never wraps, see HelpView.svelte's
 * layout comment), and the literal key chip(s) that trigger it. */
export interface HelpRow {
  name: string;
  desc: string;
  keys: string[];
}

/** One sidebar scope — both a "SCOPES" tab (HelpView derives its count from
 * `rows.length`) and a content section under that tab. `hint` is the short
 * label shown next to the section header (e.g. "Ctrl-b, then a key"). */
export interface HelpScope {
  id: string;
  label: string;
  hint: string;
  rows: HelpRow[];
}

/** Page chrome only (title/filter/legend) — `scopes` is assembled from the
 * `help` content collection by `buildHelp` below. */
export interface HelpChrome {
  title: string;
  filterPlaceholder: string;
  allScopeLabel: string;
  emptyStateText: string;
  legend: string[];
}

export interface HelpData extends HelpChrome {
  scopes: HelpScope[];
}

export const getHelpChrome = (): HelpChrome => loadYaml<HelpChrome>("help.yaml");

export const buildHelp = (entries: CollectionEntry<"help">[]): HelpData => {
  const scopes = entries
    .slice()
    .sort((a, b) => a.data.order - b.data.order)
    .map((e) => ({ id: e.id, label: e.data.label, hint: e.data.hint, rows: e.data.rows }));
  return { ...getHelpChrome(), scopes };
};

// ---------------------------------------------------------------------------
// boot.yaml (config) + src/content/boot/log.md (log text)
// ---------------------------------------------------------------------------

export interface BootHandshakeData {
  label: string;
  ready: string;
  negotiating: string;
}

export interface BootCompassData {
  top: string;
  bottom: string;
  left: string;
  right: string;
  degrees: string[];
}

export interface BootStatusRow {
  prefix: string;
  threshold: number;
  onlineText: string;
}

export interface BootStatusBoxData {
  top: string;
  bottom: string;
  rowSuffix: string;
  rows: BootStatusRow[];
}

export interface BootLogEntry {
  threshold: number;
  tag: "ok" | "warn" | "done";
  label: string;
  val: string;
}

/** boot.yaml's own `log[]` shape — timing/tag config only, joined to its
 * text (label/val) in the `boot` content collection by `id`. */
interface BootLogConfigRow {
  id: string;
  threshold: number;
  tag: "ok" | "warn" | "done";
}

export interface BootTintPalette {
  border: string;
  glowStart: string;
  glowEnd: string;
  shadowInset: string;
  shadowOuter: string;
  labelColor: string;
  pctColor: string;
  phaseColor: string;
}

interface BootConfig {
  bootMs: number;
  coreTint: "cyan" | "red" | "gold";
  showBootLog: boolean;
  sessionId: string;
  commandLineTemplate: string;
  handshake: BootHandshakeData;
  phaseLabels: { init: string; scan: string; link: string; lock: string; ready: string };
  coreLabel: string;
  compass: BootCompassData;
  statusBox: BootStatusBoxData;
  bootLogTitle: string;
  log: BootLogConfigRow[];
  tints: Record<"cyan" | "red" | "gold", BootTintPalette>;
}

export interface BootData extends Omit<BootConfig, "log"> {
  log: BootLogEntry[];
}

export const buildBoot = (entries: CollectionEntry<"boot">[]): BootData => {
  const config = loadYaml<BootConfig>("boot.yaml");
  const textById = new Map(entries.flatMap((e) => e.data.entries).map((row) => [row.id, row]));
  const log = config.log.map((row) => {
    const text = textById.get(row.id);
    if (!text) throw new Error(`src/common/lib/data.ts: boot.yaml log id "${row.id}" has no matching src/content/boot entry`);
    return { threshold: row.threshold, tag: row.tag, label: text.label, val: text.val };
  });
  const unmatched = [...textById.keys()].filter((id) => !config.log.some((row) => row.id === id));
  if (unmatched.length > 0) {
    throw new Error(`src/common/lib/data.ts: src/content/boot has entries with no matching boot.yaml log id: ${unmatched.join(", ")}`);
  }
  return { ...config, log };
};

// ---------------------------------------------------------------------------
// cmdline.yaml
// ---------------------------------------------------------------------------

/** Shape matches src/common/lib/cmdline.ts's own `CommandDef` structurally (kept as
 * a separate declaration rather than importing it here so that pure,
 * DOM-free module has zero dependency on this build-time YAML loader). */
export interface CmdlineCommandDef {
  name: string;
  aliases?: string[];
  description: string;
  action?: string;
  takesArgs?: boolean;
}

export interface CmdlineErrors {
  unknownCommandTemplate: string;
  usageRenameWindow: string;
  usageSelectWindow: string;
  noSuchWindowTemplate: string;
  unknownLayoutTemplate: string;
}

export interface CmdlineData {
  title: string;
  prompt: { glyph: string; cursorGlyph: string };
  /** Appended after a command's name in the suggestion list when its
   * `takesArgs` is true (e.g. "grep <…>"). */
  argsPlaceholder: string;
  exCommands: CmdlineCommandDef[];
  commands: CmdlineCommandDef[];
  tmuxCommands: CmdlineCommandDef[];
  errors: CmdlineErrors;
}

export const getCmdline = (): CmdlineData => loadYaml<CmdlineData>("cmdline.yaml");

// ---------------------------------------------------------------------------
// helpsearch.yaml
// ---------------------------------------------------------------------------

export interface HelpSearchData {
  title: string;
  prompt: { glyph: string; cursorGlyph: string };
  emptyHint: string;
  noResultsText: string;
  keymapHint: string;
  footer: { hint: string };
}

export const getHelpSearch = (): HelpSearchData => loadYaml<HelpSearchData>("helpsearch.yaml");

// ---------------------------------------------------------------------------
// shell.yaml
// ---------------------------------------------------------------------------

export interface ShellErrors {
  commandNotFoundTemplate: string;
  cdNoSuchDirTemplate: string;
  cdNotADirTemplate: string;
  lsNoSuchTemplate: string;
  catMissingArgMessage: string;
  catNoSuchFileTemplate: string;
  catIsADirTemplate: string;
  catUnindexedTemplate: string;
  vimMissingArgMessage: string;
  vimNoSuchFileTemplate: string;
  vimIsADirTemplate: string;
  nestedTmuxMessage: string;
  tmuxUnknownSubcommandTemplate: string;
}

export interface ShellHostNarrativeRow {
  text: string;
  kind: "input" | "output" | "error";
}

export interface ShellHostData {
  narrative: ShellHostNarrativeRow[];
  detachedTemplate: string;
  exitedMessage: string;
  logoutMessage: string;
  notAttachedMessage: string;
  windowGoneTemplate: string;
}

export interface ShellHelpRow {
  cmd: string;
  description: string;
}

export interface ShellNeofetchField {
  label: string;
  value: string;
}

export interface ShellData {
  prompt: { paneTemplate: string; hostTemplate: string };
  homeLabel: string;
  errors: ShellErrors;
  sudo: { message: string };
  whoami: string;
  viewNames: { label: string };
  help: { intro: string; rows: ShellHelpRow[] };
  neofetch: {
    art: string[];
    fields: ShellNeofetchField[];
    uptimeLabel: string;
    uptimeTemplate: string;
  };
  tmux: {
    lsRowTemplate: string;
    lsAttachedSuffix: string;
    noSessionsMessage: string;
    duplicateSessionTemplate: string;
    cantFindSessionTemplate: string;
  };
  host: ShellHostData;
  /** Labels for the read-only vim Editor the `vim`/`vi`/`nvim <file>`
   * builtin opens over the shell pane; same shape repositories.yaml's/
   * personnel.yaml's own `editor:` blocks already use. */
  editor: EditorLabels;
}

export const getShell = (): ShellData => loadYaml<ShellData>("shell.yaml");

// ---------------------------------------------------------------------------
// choosetree.yaml
// ---------------------------------------------------------------------------

export interface ChooseTreeData {
  titlePrefix: string;
  titleTilde: string;
  sessionTemplate: string;
  sessionAttachedSuffix: string;
  windowTemplate: string;
  preview: {
    windowPanesLabel: string;
    windowLayoutLabel: string;
    noLayoutText: string;
    sessionWindowsTemplate: string;
  };
  hint: string;
  killWindowPromptTemplate: string;
  killSessionPromptTemplate: string;
}

export const getChooseTree = (): ChooseTreeData => loadYaml<ChooseTreeData>("choosetree.yaml");
