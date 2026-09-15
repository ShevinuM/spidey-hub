// The shared type contract every feature's data is built against, plus the
// four loaders for common's own copy/labels yaml (site, tracker, cmdline,
// choosetree). Every feature-owned loader/builder — and the `?raw` import it
// reads — lives in that feature's own `lib/data.ts` instead; see
// `src/common/lib/yaml.ts` for the shared parse cache both sides call into.
import siteRaw from "../content/site.yaml?raw";
import trackerRaw from "../content/tracker.yaml?raw";
import cmdlineRaw from "../content/cmdline.yaml?raw";
import choosetreeRaw from "../content/choosetree.yaml?raw";
import { parseYaml } from "./yaml";

// site.yaml

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

export const getSite = (): SiteData => parseYaml<SiteData>(siteRaw, "site.yaml");

// dashboard.yaml

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

// notifications.yaml (chrome) + src/features/notifications/content/*.md (pool)

/** A notification pool entry, re-declared here (not imported) so this build-time loader stays framework/runtime agnostic. */
export interface NotificationPoolEntry {
  id: string;
  sev: "alert" | "warn" | "info";
  title: string;
  body: string;
  src: string;
}

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

/** notifications.yaml's own shape — chrome (`ui`) only, joined to the built
 * pool by `buildNotifications` in `src/features/notifications/lib/data.ts`. */
export interface NotificationsChrome {
  ui: NotificationsUi;
}

// tracker.yaml

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

export const getTracker = (): TrackerData => parseYaml<TrackerData>(trackerRaw, "tracker.yaml");

// src/features/profile/content/*.md

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

// repositories.yaml

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

/** Panel [3]'s virtual "all-projects" row, backed by public/generated/repos/all-projects.json; not a real repo, so no branch to track and no commits. */
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
    commits: {
      label: string;
      subtitleTemplate: string;
      authorInitials: string;
      localOnlyText: string;
    };
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

// grep.yaml

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

// personnel.yaml

export interface PersonnelData {
  breadcrumb: string;
  /** Personnel collection top-level dir segment (org) to its 2-3 char row tag, e.g. "memorial-university" -> "mun". */
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

// src/features/help/content/help.yaml + src/features/help/content/*.md

/** One keymap row: a short `name`, a one-line `desc` that never wraps (see HelpView.svelte), and the key chip(s) that trigger it. */
export interface HelpRow {
  name: string;
  desc: string;
  keys: string[];
}

/** One sidebar scope: both a "SCOPES" tab and its content section; `hint` is the short label next to the section header. */
export interface HelpScope {
  id: string;
  label: string;
  hint: string;
  rows: HelpRow[];
}

/** Page chrome only (title/filter/legend) — `scopes` is assembled from the
 * `help` content collection by `buildHelp` in
 * `src/features/help/lib/data.ts`. */
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

// boot.yaml (config) + src/features/boot/content/log.md (log text)

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
 * text (label/val) in the `boot` content collection by `id`, in
 * `src/features/boot/lib/data.ts`'s `buildBoot`. */
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

export interface BootConfig {
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

// cmdline.yaml

/** Shape matches cmdline.ts's own `CommandDef`, kept as a separate declaration so that pure module has zero dependency on this build-time loader. */
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

export const getCmdline = (): CmdlineData => parseYaml<CmdlineData>(cmdlineRaw, "cmdline.yaml");

// helpsearch.yaml

export interface HelpSearchData {
  title: string;
  prompt: { glyph: string; cursorGlyph: string };
  emptyHint: string;
  noResultsText: string;
  keymapHint: string;
  footer: { hint: string };
}

// shell.yaml

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

// choosetree.yaml

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

export const getChooseTree = (): ChooseTreeData =>
  parseYaml<ChooseTreeData>(choosetreeRaw, "choosetree.yaml");
