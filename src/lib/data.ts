// Build-time loader for src/data/*.yaml — every user-visible string that
// isn't part of a content collection lives in one of these files (PLAN.md
// "Architecture — content out of components"). Astro pages/layouts read
// this module and pass plain data down as props; Svelte islands never read
// the filesystem themselves.
//
// Each file is a static `?raw` import (inlined as a string by Vite at
// build time) rather than a runtime `node:fs` read relative to
// `import.meta.url`: Astro's static build bundles this module into
// `dist/.prerender/chunks/`, which moves it well away from `src/data/` on
// disk, so a `readFileSync(dirname(import.meta.url) + "../data/...")` path
// resolves under `dist/` and 404s (ENOENT) exactly once real pages start
// calling these getters — `astro sync`/dev never bundles this file, so
// Phase 2's `astro sync`-only verification didn't exercise this path).
// `?raw` imports have no such problem: Vite resolves and inlines the file
// content at the *import's* location during bundling, independent of
// where the chunk ends up at runtime.
import YAML from "yaml";
import siteRaw from "../data/site.yaml?raw";
import dashboardRaw from "../data/dashboard.yaml?raw";
import trackerRaw from "../data/tracker.yaml?raw";
import profileRaw from "../data/profile.yaml?raw";
import buildsRaw from "../data/builds.yaml?raw";
import grepRaw from "../data/grep.yaml?raw";
import personnelRaw from "../data/personnel.yaml?raw";
import companiesRaw from "../data/companies.yaml?raw";
import helpRaw from "../data/help.yaml?raw";
import bootRaw from "../data/boot.yaml?raw";
import cmdlineRaw from "../data/cmdline.yaml?raw";
import notificationsRaw from "../data/notifications.yaml?raw";

const RAW: Record<string, string> = {
  "site.yaml": siteRaw,
  "dashboard.yaml": dashboardRaw,
  "tracker.yaml": trackerRaw,
  "profile.yaml": profileRaw,
  "builds.yaml": buildsRaw,
  "grep.yaml": grepRaw,
  "personnel.yaml": personnelRaw,
  "companies.yaml": companiesRaw,
  "help.yaml": helpRaw,
  "boot.yaml": bootRaw,
  "cmdline.yaml": cmdlineRaw,
  "notifications.yaml": notificationsRaw,
};

const cache = new Map<string, unknown>();

function loadYaml<T>(file: string): T {
  const cached = cache.get(file);
  if (cached !== undefined) return cached as T;
  const raw = RAW[file];
  if (raw === undefined) throw new Error(`src/lib/data.ts: no ?raw import registered for "${file}"`);
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
    session: string;
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
  hotkey: string;
}

export interface DashboardData {
  plate: { title: string };
  menu: MenuEntry[];
  footer: { syncLine: string; switchingTemplate: string };
  toasts: { closeIcon: string };
}

export const getDashboard = (): DashboardData => loadYaml<DashboardData>("dashboard.yaml");

// ---------------------------------------------------------------------------
// notifications.yaml
// ---------------------------------------------------------------------------

export interface NotificationEntry {
  id: string;
  icon: string;
  badge: string;
  text: string;
}

export interface NotificationsData {
  pool: NotificationEntry[];
}

export const getNotifications = (): NotificationsData => loadYaml<NotificationsData>("notifications.yaml");

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
// profile.yaml
// ---------------------------------------------------------------------------

export interface ProfileField {
  label: string;
  value?: string;
  valuePrefix?: string;
  linkText?: string;
  linkHref?: string;
}

export interface ContactRow {
  icon: string;
  alt: string;
  text: string;
  href: string | null;
}

/** PLAN.md Iteration 3 Phase 1 item 1.4: one EDUCATION entry (degree,
 * school, location, dates) — both rows sourced verbatim from the resume. */
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
  summary: { heading: string; paragraphs: string[] };
  // PLAN.md Iteration 3 Phase 1 item 1.4: the data file's own "Agent
  // Profile → Summary" bio, its own titled dossier block (distinct from
  // `summary` above).
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

export const getProfile = (): ProfileData => loadYaml<ProfileData>("profile.yaml");

// ---------------------------------------------------------------------------
// builds.yaml
// ---------------------------------------------------------------------------

export interface CommandLogLine {
  text: string;
  emphasize?: string[];
  links?: { text: string; href: string }[];
}

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
  /** Panel [2] before any repo has been opened (PLAN.md Phase 4: panel [2]
   * is the tree browser now, with no default content of its own — the old
   * always-visible project list is gone). */
  emptyText: string;
}

/** Panel [3]'s virtual "all-projects" row (PLAN.md Phase 4 item 2/4) — every
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

export interface BuildsData {
  panels: {
    status: { title: string };
    // PLAN.md Phase 4: panel [2] is the tree browser now (no more static
    // "- projects/*.md" subtitle / git-status-letter row prefix) — its
    // subtitle is "<repo>" or "<repo> @<sha8>" once a repo/commit is open.
    files: { title: string; subtitleTemplate: string };
    repos: { title: string };
    commits: { title: string; subtitle: string; authorInitials: string; localOnlyText: string };
    changes: { title: string; subtitleTemplate: string };
    commandLog: { title: string };
  };
  statusLine: {
    prefix: string;
    arrow: string;
    reposSuffix: string;
    separator: string;
    projectsSuffix: string;
  };
  commandLog: CommandLogLine[];
  repoBrowser: RepoBrowserData;
  allProjects: AllProjectsData;
  spinner: SpinnerData;
  commitBrowser: CommitBrowserData;
  filePreview: FilePreviewData;
  editor: EditorLabels;
}

export const getBuilds = (): BuildsData => loadYaml<BuildsData>("builds.yaml");

// ---------------------------------------------------------------------------
// grep.yaml
// ---------------------------------------------------------------------------

export type FileKind = [glyph: string, color: string];

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
  fileKinds: Record<string, FileKind>;
  fileKindFallback: FileKind;
}

export const getGrep = (): GrepData => loadYaml<GrepData>("grep.yaml");

// ---------------------------------------------------------------------------
// personnel.yaml
// ---------------------------------------------------------------------------

export interface PersonnelData {
  pathPrefix: string;
  insetTitles: { fileBrowser: string; filePreview: string };
  promptIcon: string;
  // PLAN.md Iteration 3 Phase 1 item 1.3: Personnel.svelte is now a
  // depth-generic directory browser (variable-depth tree derived from
  // content file paths), so the hint line has exactly two shapes rather
  // than one per fixed level: `atDir` for any directory row (root or
  // nested — {dir} is interpolated with the directory's own name, "h goes
  // back" is simply omitted by the template text at the root since there's
  // nowhere to go back to) and `atFile` for a role file row. `atRoot` covers
  // the top level specifically, where h/Backspace never do anything (no
  // "goes back" clause, same wording rule the old atCompanyLevel hint used).
  hints: { atRoot: string; atDir: string; atFile: string };
  upEntry: { icon: string; name: string };
  companyRowIcon: string;
  roleRowIcon: string;
  roleCountTemplate: string;
  roleWordSingular: string;
  roleWordPlural: string;
  posTemplate: string;
  editor: EditorLabels;
}

export const getPersonnel = (): PersonnelData => loadYaml<PersonnelData>("personnel.yaml");

// ---------------------------------------------------------------------------
// companies.yaml
// ---------------------------------------------------------------------------

export interface CompanyEntry {
  name: string;
  order: number;
}

export const getCompanies = (): CompanyEntry[] => loadYaml<CompanyEntry[]>("companies.yaml");

// ---------------------------------------------------------------------------
// help.yaml
// ---------------------------------------------------------------------------

/** One keymap row. `status` marks bindings that don't exist yet at HEAD —
 * PLAN.md Phase 1 requires help.yaml to be the single source of truth for
 * every binding across the whole plan (incl. Phase 3/5 work), added here
 * ahead of the code that implements it so README/help never drift; `status`
 * lets HelpView (and a future README generator) flag those rows instead of
 * silently claiming they already work. Omitted (undefined) means "live
 * today". */
export interface HelpRow {
  key: string;
  description: string;
  status?: "planned";
}

export interface HelpSection {
  title: string;
  rows: HelpRow[];
}

export interface HelpData {
  title: string;
  scrollHint: string;
  plannedNote: string;
  sections: HelpSection[];
}

export const getHelp = (): HelpData => loadYaml<HelpData>("help.yaml");

// ---------------------------------------------------------------------------
// boot.yaml
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

export interface BootData {
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
  log: BootLogEntry[];
  tints: Record<"cyan" | "red" | "gold", BootTintPalette>;
}

export const getBoot = (): BootData => loadYaml<BootData>("boot.yaml");

// ---------------------------------------------------------------------------
// cmdline.yaml
// ---------------------------------------------------------------------------

/** Shape matches src/lib/cmdline.ts's own `CommandDef` structurally (kept as
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
}

export interface CmdlineData {
  title: string;
  prompt: { glyph: string; cursorGlyph: string };
  /** PLAN.md Phase 6 item 6.4 content-purity fix: appended after a
   * command's name in the suggestion list when its `takesArgs` is true
   * (e.g. "grep <…>") — was previously hardcoded in Cmdline.svelte. */
  argsPlaceholder: string;
  exCommands: CmdlineCommandDef[];
  commands: CmdlineCommandDef[];
  tmuxCommands: CmdlineCommandDef[];
  errors: CmdlineErrors;
}

export const getCmdline = (): CmdlineData => loadYaml<CmdlineData>("cmdline.yaml");
