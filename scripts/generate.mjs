#!/usr/bin/env node
// Build-time data generation. Produces five kinds of artifacts:
//
//  1. public/generated/repos/<name>.json — file tree + text contents for
//     each of the eight repos declared in
//     src/features/repositories/content/repositories/*.md frontmatter,
//     fetched as a SHA-pinned GitHub tarball (pins in repos.json) and
//     cached under .cache/repos/<name>-<sha>/ (lazy-fetched by the
//     Repositories island when a repo is opened).
//  1b. public/generated/repos/all-projects.json — same {name, files} shape,
//     built from src/features/repositories/content/repositories/*.md (one
//     entry per project doc, path "<id>.md", lines = the raw file text)
//     instead of a repo tarball, backing Repositories' virtual
//     "all-projects" repo. Reads straight from
//     src/features/repositories/content/repositories regardless of
//     PORTFOLIO_FIXTURES — this script has no fixture awareness at all.
//     `pnpm build:fixtures` overwrites this one file post-build from
//     src/features/repositories/tests/ui/support/repos/all-projects.json.
//  2. public/generated/grep-index.json — walks the site's own source so the
//     grep overlay (`/`) can search real content.
//  3. src/generated/commits/<repo>.json — a snapshot of the 15 most recent
//     commits per repo via the GitHub REST API, imported statically so
//     Repositories renders identically offline; on API failure the existing
//     snapshot is kept and a warning printed. Each entry carries the full
//     40-char `sha` alongside `sha8`, needed to fetch a commit's tree via
//     GitHub's Git Trees API (src/features/repositories/lib/github-trees.ts).
//  4. public/generated/contributions.json — a year of GitHub contribution
//     levels (0-4 per day) for the Repositories Status pane's contribution
//     grid. GraphQL when GITHUB_TOKEN is set, else scrape the public
//     github.com/users/<OWNER>/contributions HTML fragment, else leave the
//     existing snapshot untouched. Lives in public/generated/ (not
//     src/generated/) because it is fetched client-side at runtime rather
//     than statically imported at build time; see
//     src/features/repositories/components/repositoriesState.svelte.ts.
//
// Run via `pnpm generate` (also wired to predev/prebuild).

import {
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, extname, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getIcon, defaultIcon } from "material-file-icons";
import YAML from "yaml";
import { tokenizeFile, PaletteBuilder } from "../src/common/lib/highlight.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SIZE_CAP = 200 * 1024; // 200KB

// ---------------------------------------------------------------------------
// Text-file detection (shared by the repo indexer and the grep indexer)
// ---------------------------------------------------------------------------

const TEXT_EXTENSIONS = new Set([
  // web / JS ecosystem
  "md", "mdx", "txt", "json", "yaml", "yml", "toml", "ini", "cfg", "conf",
  "properties", "xml", "html", "htm", "css", "scss", "less",
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "svelte", "astro", "vue",
  // languages found in the eight repos (and generally common)
  "py", "java", "kt", "kts", "gradle", "rb", "go", "rs",
  "c", "cc", "cpp", "h", "hpp", "cs", "php",
  "sh", "bash", "zsh", "fish", "ps1", "cmd",
  "sql", "graphql", "gql",
  "svg", "fxml",
  "env",
]);

// Auto-generated lockfiles: never treated as "source" even though they are
// technically text — huge and add nothing to a repo browse or grep index.
const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "uv.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
  "Cargo.lock",
  "mix.lock",
]);

// Extensionless dotfiles worth keeping (config, not secrets).
const DOTFILE_ALLOW = new Set([
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".npmrc",
  ".nvmrc",
  ".python-version",
  ".env.example",
]);

// Extensionless plain files worth keeping.
const NOEXT_ALLOW = new Set(["LICENSE", "README", "Makefile", "Dockerfile", "mvnw"]);

function isTextFile(fullPath) {
  const name = basename(fullPath);
  if (name === ".git") return false;
  if (LOCKFILE_NAMES.has(name)) return false;

  let size;
  try {
    size = statSync(fullPath).size;
  } catch {
    return false;
  }
  if (size > SIZE_CAP) return false;

  const ext = extname(name).slice(1).toLowerCase();
  if (name.startsWith(".") && !ext) {
    return DOTFILE_ALLOW.has(name);
  }
  if (ext && TEXT_EXTENSIONS.has(ext)) return true;
  if (!ext && NOEXT_ALLOW.has(name)) return true;
  return false;
}

function toPosix(p) {
  return p.split(sep).join("/");
}

/**
 * Recursively walk `dir`, pushing {path, lines} entries (path relative to
 * `root`, posix-separated) for every file that passes isTextFile() and isn't
 * inside a directory named in `skipDirs`. Symlinks are not followed.
 */
function walk(dir, skipDirs, collected, root) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(join(dir, entry.name), skipDirs, collected, root);
      continue;
    }
    if (!entry.isFile()) continue;
    const full = join(dir, entry.name);
    if (!isTextFile(full)) continue;
    let content;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    // Binary guard: a stray NUL byte means our extension allowlist let a
    // non-text file slip through (shouldn't happen, but stay safe).
    if (content.includes("\u0000")) continue;
    collected.push({ path: toPosix(relative(root, full)), lines: content.split("\n") });
  }
}

// GitHub account these repos/commits/contributions all belong to — the one
// constant every GitHub-facing step in this script shares.
const OWNER = "ShevinuM";

// ---------------------------------------------------------------------------
// 1. Repo indexes (public/generated/repos/<name>.json)
// ---------------------------------------------------------------------------

const PROJECTS_DIR = join(ROOT, "src/features/repositories/content/repositories");

/**
 * Reads {name, github, branch} for every repo declared across all project
 * docs' `repos:` frontmatter arrays (schema: src/content.config.ts's
 * `repoSchema`) under src/features/repositories/content/repositories/ —
 * always the real content dir, never PORTFOLIO_FIXTURES (see file header).
 * Astro's getCollection() isn't available in a prebuild script, so
 * frontmatter is parsed by hand: split off the leading `---\n...\n---` block
 * and hand it to `yaml` (already a runtime dependency — see
 * src/common/lib/data.ts).
 */
function loadProjectRepos() {
  const repos = [];
  for (const entry of readdirSync(PROJECTS_DIR).sort()) {
    if (!entry.endsWith(".md")) continue;
    const raw = readFileSync(join(PROJECTS_DIR, entry), "utf8");
    const match = /^---\n([\s\S]*?)\n---/.exec(raw);
    if (!match) throw new Error(`${entry}: missing frontmatter block`);
    const frontmatter = YAML.parse(match[1]);
    for (const r of frontmatter.repos ?? []) {
      repos.push({ name: r.name, github: r.github, branch: r.branch });
    }
  }
  return repos;
}

const REPOS = loadProjectRepos();

// ---------------------------------------------------------------------------
// Repo tarball cache (.cache/repos/<name>-<sha>/) — sourced from
// codeload.github.com.
//
// Deliberate: this reads from each repo's committed git tree — a `git
// archive`-equivalent snapshot at a pinned SHA — never from a working
// checkout on disk. A working checkout can carry untracked, machine-local
// files (build tooling, editor/plugin state, anything gitignored) that were
// never part of the repo; sourcing from the tree makes that class of
// contamination structurally impossible.
// ---------------------------------------------------------------------------

const REPOS_JSON_PATH = join(ROOT, "repos.json");
const REPO_CACHE_DIR = join(ROOT, ".cache/repos");

function loadPins() {
  if (!existsSync(REPOS_JSON_PATH)) return {};
  return JSON.parse(readFileSync(REPOS_JSON_PATH, "utf8"));
}

function savePins(pins) {
  const sorted = Object.fromEntries(Object.keys(pins).sort().map((k) => [k, pins[k]]));
  writeFileSync(REPOS_JSON_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

/**
 * Returns the commit SHA to fetch for `name`: the pin already recorded in
 * repos.json, or — only when a repo has no pin at all — the current head of
 * `branch` via the GitHub REST API, recorded into repos.json immediately so
 * the pin survives even if a later repo in the loop fails.
 */
async function resolveSha(pins, name, github, branch) {
  if (pins[name]) return pins[name];
  const url = `https://api.github.com/repos/${github}/commits/${branch}`;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "shevinum-dev-v3-generate-script" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.sha) {
    throw new Error(`GET ${url} -> unexpected response shape`);
  }
  pins[name] = data.sha;
  savePins(pins);
  console.warn(`[generate] new pin recorded for ${name} (${data.sha}) — commit repos.json`);
  return data.sha;
}

/**
 * Ensures a SHA-keyed extraction of <github>@<sha> exists at
 * .cache/repos/<name>-<sha>/, fetching and extracting it if not already
 * cached — a cache hit costs zero network, so predev stays instant after the
 * first run. Extracts into a sibling temp directory and renames into place
 * only once extraction succeeds, so an interrupted fetch can never leave
 * behind a cache entry a later run would wrongly treat as a hit.
 */
async function ensureRepoCache(name, github, sha) {
  const finalDir = join(REPO_CACHE_DIR, `${name}-${sha}`);
  if (existsSync(finalDir)) return finalDir;
  mkdirSync(REPO_CACHE_DIR, { recursive: true });
  const url = `https://codeload.github.com/${github}/tar.gz/${sha}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpDir = mkdtempSync(join(REPO_CACHE_DIR, `.tmp-${name}-`));
  try {
    // GitHub nests the archive's contents one level down, under
    // <repo>-<sha>/ (codeload's own naming — not necessarily this
    // project's `name`, which is why --strip-components=1 is required;
    // getting it wrong would silently re-prefix every path in the output).
    const result = spawnSync("tar", ["-xz", "--strip-components=1", "-C", tmpDir], { input: buffer });
    if (result.status !== 0) {
      const stderr = result.stderr?.toString().trim();
      throw new Error(`tar extraction failed for ${github}@${sha}${stderr ? `: ${stderr}` : ""}`);
    }
    renameSync(tmpDir, finalDir);
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
  return finalDir;
}

/**
 * Tokenizes one already-walked file entry in place: on success replaces
 * `lines: string[]` with `{tok: 1, lines: TokenSpan[][]}` (colors resolved
 * against `palette`, shared across the whole repo JSON); any fallback case
 * (no grammar for the extension, over SIZE_CAP, tokenizer throws, or a
 * lossless round-trip check fails) leaves the entry as flat plain-text
 * lines, unchanged.
 */
async function tokenizeRepoFile(file, palette) {
  const ext = extname(file.path).slice(1).toLowerCase();
  const text = file.lines.join("\n");
  const tokenLines = await tokenizeFile(ext, text, palette, SIZE_CAP);
  if (!tokenLines) return file;
  return { path: file.path, tok: 1, lines: tokenLines };
}

async function generateRepoIndexes() {
  const outDir = join(ROOT, "public/generated/repos");
  mkdirSync(outDir, { recursive: true });
  const pins = loadPins();
  for (const { name, github, branch } of REPOS) {
    let repoDir;
    try {
      const sha = await resolveSha(pins, name, github, branch);
      repoDir = await ensureRepoCache(name, github, sha);
    } catch (err) {
      console.warn(`[generate] WARNING: fetch failed for ${name} (${err.message}); keeping existing snapshot.`);
      continue;
    }
    const files = [];
    // A GitHub tarball contains no `.git` entry, so no directory skip is
    // needed here; the empty set is for symmetry with the other walk() call
    // sites in this file.
    walk(repoDir, new Set(), files, repoDir);
    files.sort((a, b) => a.path.localeCompare(b.path));
    const palette = new PaletteBuilder();
    const tokenized = [];
    for (const file of files) {
      tokenized.push(await tokenizeRepoFile(file, palette));
    }
    const index = { name, palette: palette.palette, files: tokenized };
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(index) + "\n");
    const tokCount = tokenized.filter((f) => f.tok === 1).length;
    console.log(
      `[generate] public/generated/repos/${name}.json — ${files.length} text files (${tokCount} tokenized)`,
    );
  }
}

/**
 * public/generated/repos/all-projects.json — one entry per project doc under
 * src/features/repositories/content/repositories/, path "<id>.md" (id = the
 * filename verbatim, same case-preserving rule content.config.ts's
 * generateId uses), lines = the raw file text (frontmatter included — a
 * literal file snapshot, not a parsed content-collection entry) split on
 * "\n". Same {name, files} shape as generateRepoIndexes() so
 * src/common/lib/repo-tree.ts's listDir/findFile and the Repositories
 * component's fetch-and-browse flow work on it unmodified.
 */
function generateAllProjectsIndex() {
  const srcDir = join(ROOT, "src/features/repositories/content/repositories");
  const outDir = join(ROOT, "public/generated/repos");
  mkdirSync(outDir, { recursive: true });
  const files = [];
  if (existsSync(srcDir)) {
    for (const entry of readdirSync(srcDir)) {
      if (!entry.endsWith(".md")) continue;
      const full = join(srcDir, entry);
      if (!statSync(full).isFile()) continue;
      const content = readFileSync(full, "utf8");
      files.push({ path: entry, lines: content.split("\n") });
    }
  } else {
    console.warn("[generate] src/features/repositories/content/repositories not found — skipping all-projects.json.");
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const index = { name: "all-projects", files };
  writeFileSync(join(outDir, "all-projects.json"), JSON.stringify(index) + "\n");
  console.log(`[generate] public/generated/repos/all-projects.json — ${files.length} project docs`);
}

// ---------------------------------------------------------------------------
// 2. Grep index (public/generated/grep-index.json)
// ---------------------------------------------------------------------------
//
// Walks the site's own source: src/**, scripts/**, tests/** (excluding
// goldens — binary PNGs), plus a short list of root config files and
// README.md.
//
// The vendored design handoff copy at the repo root (`reference/`, see
// src/common/tests/ui/support/README-PIPELINE.md) sits outside every subdir
// this walker visits, so it needs no skip entry — it is ~3MB of third-party
// HTML/JS/images, never shipped, and excluding it keeps the live grep
// overlay to the site's own source.

const GREP_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".astro",
  "goldens",
]);

const GREP_ROOT_SUBDIRS = ["src", "scripts", "tests"];

const GREP_ROOT_FILES = [
  "package.json",
  "astro.config.mjs",
  "tsconfig.json",
  "playwright.config.ts",
  "pnpm-workspace.yaml",
  "README.md",
];

/**
 * Computes the grep index's file list (path + content lines, sorted by
 * path) by walking its sources fresh from disk. Factored out of
 * generateGrepIndex() so collectIconFilenames() can call it as a paths-only
 * prewalk before generateFileIcons() runs; generateGrepIndex() then calls
 * this again afterward, picking up the file-icons.json bytes
 * generateFileIcons() wrote.
 */
function collectGrepFiles() {
  const files = [];
  for (const sub of GREP_ROOT_SUBDIRS) {
    const dir = join(ROOT, sub);
    if (existsSync(dir)) walk(dir, GREP_SKIP_DIRS, files, ROOT);
  }
  for (const rel of GREP_ROOT_FILES) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) continue;
    if (!isTextFile(full)) continue;
    const content = readFileSync(full, "utf8");
    files.push({ path: rel, lines: content.split("\n") });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function generateGrepIndex() {
  const files = collectGrepFiles();
  mkdirSync(join(ROOT, "public/generated"), { recursive: true });
  writeFileSync(join(ROOT, "public/generated/grep-index.json"), JSON.stringify(files) + "\n");
  console.log(`[generate] public/generated/grep-index.json — ${files.length} files`);
}

// ---------------------------------------------------------------------------
// 2b. Shell fs-index (public/generated/fs-index.json) — the generated
//     filesystem the in-window shell's cd/ls/tree/cat walk. A flat
//     `{path, size?}[]` list, same convention as the grep/repo indexes'
//     `{path, lines}[]`: src/common/lib/shell.ts derives directory structure
//     from path prefixes, like src/common/lib/repo-tree.ts's listDir does
//     for a single repo.
//
// Same skip list as the grep walker, plus `public/generated` itself (this
// script's own output — including it would make fs-index.json list its own
// changing byte size every run, breaking `pnpm generate` idempotency) and
// `.DS_Store` (machine-dependent, not part of the repo). Structural:
// isTextFile() is not consulted, every file gets a size whether text or
// binary — `cat`'s own "binary or unindexed" case handles the content split.
//
// repos/* subtrees are entirely virtual: nothing under repos/ exists on disk
// at all — real repo content lives at .cache/repos/<name>-<sha>/, a path the
// shell never shows. Entries come from the per-repo index JSONs already
// written by generateRepoIndexes() (path-only), so `cat`'s lazy per-repo
// fetch always agrees with what `ls`/`tree` show even though `cd
// repos/<name>` lands nowhere on the real filesystem. The virtual
// "all-projects" entry is excluded — it has no corresponding GitHub repo, so
// there is no `repos/all-projects` shell path to populate.
// ---------------------------------------------------------------------------

const FS_INDEX_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".astro",
  "goldens",
]);

const FS_INDEX_SKIP_FILES = new Set([".DS_Store"]);

const FS_INDEX_SUBDIRS = ["src", "public", "scripts", "tests"];

/**
 * Recursively walks `dir`, pushing {path, size} entries (path relative to
 * `root`, posix-separated) for EVERY file (text or binary) not inside a
 * directory named in `skipDirs` (checked against `extraSkipDirs` too, for
 * the one-off "public/generated" exclusion). Symlinks are not followed.
 */
function walkStructure(dir, root, collected, extraSkipDirs) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (FS_INDEX_SKIP_FILES.has(entry.name)) continue;
    if (entry.isDirectory()) {
      if (FS_INDEX_SKIP_DIRS.has(entry.name) || extraSkipDirs.has(entry.name)) continue;
      walkStructure(join(dir, entry.name), root, collected, extraSkipDirs);
      continue;
    }
    if (!entry.isFile()) continue;
    const full = join(dir, entry.name);
    let size;
    try {
      size = statSync(full).size;
    } catch {
      continue;
    }
    collected.push({ path: toPosix(relative(root, full)), size });
  }
}

/**
 * Computes the fs index's entry list (path + size, sorted by path) by
 * walking its sources fresh from disk. Factored out of generateFsIndex() so
 * collectIconFilenames() can call it as a paths-only prewalk before
 * generateFileIcons() runs; generateFsIndex() then calls this again
 * afterward, picking up the file-icons.json size generateFileIcons() wrote.
 */
function collectFsEntries() {
  const entries = [];

  for (const sub of FS_INDEX_SUBDIRS) {
    const dir = join(ROOT, sub);
    if (!existsSync(dir)) continue;
    // "public/generated" is this very generator's own output — see file
    // header. No other subdir needs an exclusion.
    const extraSkip = sub === "public" ? new Set(["generated"]) : new Set();
    walkStructure(dir, ROOT, entries, extraSkip);
  }

  // Root-level files: every direct file in the repo root (a real `ls`, not
  // the grep indexer's curated allowlist above).
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isFile() || FS_INDEX_SKIP_FILES.has(entry.name)) continue;
    let size;
    try {
      size = statSync(join(ROOT, entry.name)).size;
    } catch {
      continue;
    }
    entries.push({ path: entry.name, size });
  }

  // repos/* — path-only, from the already-generated per-repo indexes.
  const reposIndexDir = join(ROOT, "public/generated/repos");
  if (existsSync(reposIndexDir)) {
    for (const file of readdirSync(reposIndexDir)) {
      if (!file.endsWith(".json") || file === "all-projects.json") continue;
      const index = JSON.parse(readFileSync(join(reposIndexDir, file), "utf8"));
      for (const f of index.files) {
        entries.push({ path: `repos/${index.name}/${f.path}` });
      }
    }
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

function generateFsIndex() {
  const entries = collectFsEntries();
  mkdirSync(join(ROOT, "public/generated"), { recursive: true });
  writeFileSync(join(ROOT, "public/generated/fs-index.json"), JSON.stringify({ entries }) + "\n");
  console.log(`[generate] public/generated/fs-index.json — ${entries.length} entries`);
}

// ---------------------------------------------------------------------------
// 3. Commit snapshots (src/generated/commits/<repo>.json)
// ---------------------------------------------------------------------------

function initialsFrom(name) {
  const s = (name || "Sh").trim();
  if (s.length === 0) return "Sh";
  if (s.length === 1) return s.toUpperCase();
  return s[0].toUpperCase() + s[1].toLowerCase();
}

async function fetchCommits(github) {
  const url = `https://api.github.com/repos/${github}/commits?per_page=15`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "shevinum-dev-v3-generate-script",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`GET ${url} -> unexpected response shape`);
  }
  return data.map((c) => {
    const sha = c.sha || "";
    const message = c.commit?.message || "";
    const authorName = c.author?.login || c.commit?.author?.name || "Sh";
    const date = c.commit?.author?.date || c.commit?.committer?.date;
    return {
      sha,
      sha8: sha.slice(0, 8),
      msg: message.split("\n")[0],
      html_url: c.html_url,
      initials: initialsFrom(authorName),
      ...(date ? { date } : {}),
    };
  });
}

async function generateCommitSnapshots() {
  const outDir = join(ROOT, "src/generated/commits");
  mkdirSync(outDir, { recursive: true });
  for (const { name, github } of REPOS) {
    const outFile = join(outDir, `${name}.json`);
    try {
      const commits = await fetchCommits(github);
      if (commits.length === 0) throw new Error("zero commits returned");
      writeFileSync(outFile, JSON.stringify(commits, null, 2) + "\n");
      console.log(`[generate] src/generated/commits/${name}.json — ${commits.length} commits (live)`);
    } catch (err) {
      if (existsSync(outFile)) {
        console.warn(`[generate] WARNING: commit fetch failed for ${name} (${err.message}); keeping existing snapshot.`);
      } else {
        console.warn(`[generate] WARNING: commit fetch failed for ${name} (${err.message}); no existing snapshot — Repositories will have no commits for this repo until this succeeds.`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3b. GitHub contributions (public/generated/contributions.json)
// ---------------------------------------------------------------------------
//
// contributionsCollection has no unauthenticated REST equivalent, so unlike
// fetchCommits() (which just sends a token if present), GraphQL here
// requires a token outright — the scrape path is the fallback whenever no
// token is set, not only on error.

const CONTRIB_LEVEL_MAP = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

async function fetchContributionsGraphQL() {
  const query =
    "query($login:String!){ user(login:$login){ contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionLevel } } } } } }";
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "shevinum-dev-v3-generate-script",
    },
    body: JSON.stringify({ query, variables: { login: OWNER } }),
  });
  if (!res.ok) {
    throw new Error(`POST graphql -> ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`graphql -> ${JSON.stringify(json.errors)}`);
  }
  const weeks = json.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks)) {
    throw new Error("graphql -> unexpected response shape");
  }
  const days = [];
  for (const week of weeks) {
    for (const day of week.contributionDays ?? []) {
      const level = CONTRIB_LEVEL_MAP[day.contributionLevel];
      if (level === undefined) {
        throw new Error(`graphql -> unknown contributionLevel "${day.contributionLevel}"`);
      }
      days.push({ date: day.date, level });
    }
  }
  if (days.length === 0) {
    throw new Error("graphql -> zero contribution days returned");
  }
  return days;
}

/**
 * Scrapes the public (unauthenticated, no API) HTML fragment GitHub serves
 * profile-page contribution graphs from. Matches each
 * `ContributionCalendar-day` `<td>` first, then pulls `data-date`/`data-level`
 * out of that one tag's attributes — never assumes their order relative to
 * each other or to `class` inside the tag.
 */
async function fetchContributionsScrape() {
  const url = `https://github.com/users/${OWNER}/contributions`;
  const res = await fetch(url, { headers: { "User-Agent": "shevinum-dev-v3-generate-script" } });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const days = [];
  const tdRe = /<td\b[^>]*class="[^"]*\bContributionCalendar-day\b[^"]*"[^>]*>/g;
  let m;
  while ((m = tdRe.exec(html))) {
    const tag = m[0];
    const date = /\sdata-date="([^"]+)"/.exec(tag)?.[1];
    const levelRaw = /\sdata-level="([^"]+)"/.exec(tag)?.[1];
    if (!date || levelRaw === undefined) continue;
    const level = Number(levelRaw);
    if (!Number.isInteger(level) || level < 0 || level > 4) continue;
    days.push({ date, level });
  }
  if (days.length === 0) {
    throw new Error(`GET ${url} -> no ContributionCalendar-day cells found (markup may have changed)`);
  }
  return days;
}

async function generateContributions() {
  const outFile = join(ROOT, "public/generated/contributions.json");
  let days;
  let source;
  try {
    if (process.env.GITHUB_TOKEN) {
      days = await fetchContributionsGraphQL();
      source = "graphql";
    } else {
      days = await fetchContributionsScrape();
      source = "scrape";
    }
  } catch (err) {
    if (existsSync(outFile)) {
      console.warn(`[generate] WARNING: contributions fetch failed (${err.message}); keeping existing snapshot.`);
    } else {
      console.warn(
        `[generate] WARNING: contributions fetch failed (${err.message}); no existing snapshot — Repositories' Status pane grid will be empty until this succeeds.`,
      );
    }
    return;
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Only rewrite (and bump fetchedAt) when the actual payload changed —
  // predev/prebuild run this on every build/test invocation, and a
  // fetchedAt that ticks every run would leave the working tree
  // perpetually dirty after this step's first real commit.
  if (existsSync(outFile)) {
    const prev = JSON.parse(readFileSync(outFile, "utf8"));
    if (prev.source === source && JSON.stringify(prev.days) === JSON.stringify(days)) {
      console.log(`[generate] public/generated/contributions.json — unchanged (${days.length} days, ${source})`);
      return;
    }
  }
  mkdirSync(join(ROOT, "public/generated"), { recursive: true });
  writeFileSync(
    outFile,
    JSON.stringify({ days, fetchedAt: new Date().toISOString(), source }) + "\n",
  );
  console.log(`[generate] public/generated/contributions.json — ${days.length} days (${source})`);
}

// ---------------------------------------------------------------------------
// 4. File icons (src/generated/file-icons.json) — a curated ext/filename ->
//    Material-icon-theme SVG map, resolved at generate time so the client
//    bundle only carries icons this site actually shows, not the library's
//    full ~380-icon set.
//
// Two-level indirection: `icons` keyed by icon name (so extensions sharing
// one icon store its SVG once), `byExt`/`byName` keyed by what the UI has on
// hand. `byName` only gets an entry when a filename's icon differs from its
// extension's generic icon (e.g. "package.json"); callers check
// `byName[basename]`, then `byExt[ext]`, then `fallback`.
// ---------------------------------------------------------------------------

/**
 * Collects every filename (basename only) that could show up anywhere the
 * site renders a file icon: the per-repo indexes, plus a paths-only prewalk
 * of the grep and fs indexes' own sources (collectGrepFiles()/
 * collectFsEntries()). Runs before those two indexes are generated (see
 * main()) since it only needs the paths those walks produce, not their
 * written JSON. Insertion order matters — icons/byExt/byName are plain
 * objects, so key order is part of the committed bytes: repos/*.json in
 * readdirSync order, then the grep sources sorted, then the fs sources
 * sorted.
 */
function collectIconFilenames() {
  const names = new Set();
  const reposDir = join(ROOT, "public/generated/repos");
  if (existsSync(reposDir)) {
    for (const file of readdirSync(reposDir)) {
      if (!file.endsWith(".json")) continue;
      const index = JSON.parse(readFileSync(join(reposDir, file), "utf8"));
      for (const f of index.files) names.add(basename(f.path));
    }
  }
  for (const f of collectGrepFiles()) names.add(basename(f.path));
  for (const e of collectFsEntries()) names.add(basename(e.path));
  return names;
}

function generateFileIcons() {
  const filenames = collectIconFilenames();
  const icons = {};
  const byExt = {};
  const byName = {};

  const registerIcon = (name, svg) => {
    if (!(name in icons)) icons[name] = svg;
  };

  for (const name of filenames) {
    const exact = getIcon(name);
    registerIcon(exact.name, exact.svg);

    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    if (!ext) {
      // Extensionless (Dockerfile, LICENSE, README, .gitignore, …): no
      // shared bucket to fall back to, so the exact name IS the lookup key.
      byName[name] = exact.name;
      continue;
    }
    // A neutral same-extension stem tells apart "this extension always
    // gets icon X" from "this ONE filename is special-cased" (e.g.
    // "package.json" -> its own icon vs any other "*.json" -> "json").
    const generic = getIcon(`x.${ext}`);
    registerIcon(generic.name, generic.svg);
    byExt[ext] = generic.name;
    if (generic.name !== exact.name) byName[name] = exact.name;
  }

  registerIcon(defaultIcon.name, defaultIcon.svg);

  const outDir = join(ROOT, "src/generated");
  mkdirSync(outDir, { recursive: true });
  const data = { icons, byExt, byName, fallback: defaultIcon.name };
  writeFileSync(join(outDir, "file-icons.json"), JSON.stringify(data) + "\n");
  console.log(
    `[generate] src/generated/file-icons.json — ${Object.keys(icons).length} icons, ${Object.keys(byExt).length} extensions, ${Object.keys(byName).length} exact names`,
  );
}

// ---------------------------------------------------------------------------

async function main() {
  await generateRepoIndexes();
  generateAllProjectsIndex();
  // Commit snapshots must complete before the grep index is generated: the
  // grep indexer walks src/generated/commits/*.json as part of the site's
  // own source, so generating it first would embed the pre-fetch snapshot
  // state and leave the index permanently one generation stale.
  await generateCommitSnapshots();
  // No ordering dependency with anything else here (neither grep-index nor
  // fs-index walk public/generated/ — see their own header comments) —
  // grouped next to the other GitHub-fetching step purely for narrative
  // order.
  await generateContributions();
  // File icons must run after generateRepoIndexes() (needs repos/*
  // filenames) and before generateGrepIndex()/generateFsIndex(), which embed
  // file-icons.json's content and byte size — either order otherwise never
  // reaches a fixed point.
  generateFileIcons();
  generateGrepIndex();
  // Must run after generateRepoIndexes(): reads the per-repo JSONs it just
  // wrote for the repos/* path-only subtrees (see generateFsIndex's own
  // header comment).
  generateFsIndex();
}

main().catch((err) => {
  console.error("[generate] fatal:", err);
  process.exitCode = 1;
});
