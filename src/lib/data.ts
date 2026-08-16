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

const RAW: Record<string, string> = {
  "site.yaml": siteRaw,
  "dashboard.yaml": dashboardRaw,
  "tracker.yaml": trackerRaw,
  "profile.yaml": profileRaw,
  "builds.yaml": buildsRaw,
  "grep.yaml": grepRaw,
  "personnel.yaml": personnelRaw,
  "companies.yaml": companiesRaw,
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

export interface SiteData {
  statusBar: {
    session: string;
    separator: string;
    windows: WindowEntry[];
    grepHint: string;
  };
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

export interface ToastCopy {
  icon: string;
  badge: string;
  prefix: string;
  emphasis: string;
  suffix: string;
}

export interface DashboardData {
  plate: { title: string; welcomePrefix: string };
  menu: MenuEntry[];
  footer: { syncLine: string; switchingTemplate: string };
  toasts: { closeIcon: string; danger: ToastCopy; tracker: ToastCopy };
}

export const getDashboard = (): DashboardData => loadYaml<DashboardData>("dashboard.yaml");

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
  backPill: { label: string; dismissGlyph: string };
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

export interface ProfileData {
  header: { badge: string; fileClearance: string; closeHint: string };
  title: { name: string; subtitle: string };
  images: {
    portrait: { alt: string; caption: string };
    field: { alt: string; caption: string };
    retinaV: { alt: string; caption: string };
  };
  fields: ProfileField[];
  summary: { heading: string; paragraphs: string[] };
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
  signal: { label: string; coords: string };
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

export interface BuildsData {
  panels: {
    status: { title: string };
    files: { title: string; subtitle: string; statusLetter: string; filler: string };
    repos: { title: string };
    commits: { title: string; subtitle: string; authorInitials: string };
    changes: { title: string };
    commandLog: { title: string };
  };
  statusLine: {
    prefix: string;
    arrow: string;
    reposSuffix: string;
    separator: string;
    projectsSuffix: string;
  };
  filePosTemplate: string;
  commandLog: CommandLogLine[];
}

export const getBuilds = (): BuildsData => loadYaml<BuildsData>("builds.yaml");

// ---------------------------------------------------------------------------
// grep.yaml
// ---------------------------------------------------------------------------

export type FileKind = [glyph: string, color: string];

export interface GrepData {
  leftPane: { titlePrefix: string; titleTilde: string; promptIcon: string };
  modeLine: { liveGrep: string; repoFiles: string };
  emptyStateTemplate: string;
  noResultsFile: string;
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
  hints: { atRoleLevel: string; atCompanyLevel: string };
  upEntry: { icon: string; name: string };
  companyRowIcon: string;
  roleRowIcon: string;
  editor: { modeLabel: string; branch: string; breadcrumbSeparator: string; closeHint: string };
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
