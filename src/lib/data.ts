// Build-time loader for src/data/*.yaml — every user-visible string that
// isn't part of a content collection lives in one of these files (PLAN.md
// "Architecture — content out of components"). Astro pages/layouts read
// this module (Node-only, build time) and pass plain data down as props;
// Svelte islands never read the filesystem themselves.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import YAML from "yaml";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../data");

const cache = new Map<string, unknown>();

function loadYaml<T>(file: string): T {
  const cached = cache.get(file);
  if (cached !== undefined) return cached as T;
  const raw = readFileSync(join(DATA_DIR, file), "utf8");
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
  badge: string;
  prefix: string;
  emphasis: string;
  suffix: string;
}

export interface DashboardData {
  plate: { title: string; welcomePrefix: string };
  menu: MenuEntry[];
  footer: { syncLine: string; switchingTemplate: string };
  toasts: { danger: ToastCopy; tracker: ToastCopy };
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
  backPill: { label: string };
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
