// Pure helpers for browsing a repo's file index, a flat {path, lines} list with no directory nodes, fetched lazily client-side since it lives under `public/`.
//
// `import type` keeps the TokenSpan reference type-only (erased at build time), so pulling in its shape never drags shiki's runtime into the client bundle.
import type { TokenSpan } from "./highlight";

export type { TokenSpan };

export interface RepoFile {
  path: string;
  tok?: 1;
  lines: string[] | TokenSpan[][];
}

export interface RepoIndex {
  name: string;
  /** Hex colors referenced by every tokenized file's `lines` in this index;
   * absent (or empty) when nothing in the index was tokenized. */
  palette?: string[];
  files: RepoFile[];
}

/** Plain text for one file, whichever form `lines` is in — the single
 * reconstruction point every caller needing raw text (previews, the editor's
 * vim engine, shell cat/vim) goes through instead of re-deriving it. */
export function repoFileText(file: RepoFile): string[] {
  if (!file.tok) return file.lines as string[];
  return (file.lines as TokenSpan[][]).map((line) => line.map(([, text]) => text).join(""));
}

export type TreeEntryType = "dir" | "file";

export interface TreeEntry {
  type: TreeEntryType;
  /** Segment name only (no slashes), e.g. "lib" or "grep.ts". */
  name: string;
  /** Full posix path from the repo root, e.g. "src/lib" or "src/features/grep/lib/grep.ts". */
  path: string;
}

/**
 * List the immediate children of `dirPath` (posix, no leading/trailing
 * slash; "" = repo root) given the repo's flat file list.
 *
 * Directories are synthesized from path prefixes shared by two or more (or
 * exactly one) files — there is no explicit directory record to read.
 *
 * Sort: directories before files, then case-insensitive name — a
 * conventional file-browser order (not derived from any prototype markup,
 * since repo browsing has no prototype precedent).
 */
export function listDir(files: RepoFile[], dirPath: string): TreeEntry[] {
  const prefix = dirPath === "" ? "" : `${dirPath}/`;
  const seen = new Map<string, TreeEntry>();

  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    if (rest === "") continue;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      seen.set(rest, { type: "file", name: rest, path: prefix + rest });
    } else {
      const dirName = rest.slice(0, slash);
      if (!seen.has(dirName)) {
        seen.set(dirName, { type: "dir", name: dirName, path: prefix + dirName });
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Look up a single file's lines by its full repo-relative path. */
export function findFile(files: RepoFile[], path: string): RepoFile | undefined {
  return files.find((f) => f.path === path);
}

/** Join path segments into a posix repo-relative path ("" for the root). */
export function joinPath(segments: string[]): string {
  return segments.join("/");
}

// Nested tree + flatten-visible helpers for the Files panel's lazygit-style tree, where all dirs are expanded by default and j/k walks the flattened visible rows.

export interface TreeNode {
  type: TreeEntryType;
  /** Segment name only, e.g. "lib" or "grep.ts" ("" for the synthetic root). */
  name: string;
  /** Full posix path from the repo root ("" for the synthetic root). */
  path: string;
  /** Only present on dirs (including the root); absent on files. */
  children?: TreeNode[];
}

/** Builds the full nested tree from a repo's flat file list, applying `listDir`'s sort convention at every level. */
export function buildTree(files: RepoFile[]): TreeNode {
  const root: TreeNode = { type: "dir", name: "", path: "", children: [] };
  const dirs = new Map<string, TreeNode>([["", root]]);

  function ensureDir(path: string, name: string, parentPath: string): TreeNode {
    const existing = dirs.get(path);
    if (existing) return existing;
    const node: TreeNode = { type: "dir", name, path, children: [] };
    dirs.set(path, node);
    dirs.get(parentPath)!.children!.push(node);
    return node;
  }

  for (const f of files) {
    const segments = f.path.split("/");
    let parentPath = "";
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const path = parentPath === "" ? seg : `${parentPath}/${seg}`;
      ensureDir(path, seg, parentPath);
      parentPath = path;
    }
    const name = segments[segments.length - 1];
    dirs.get(parentPath)!.children!.push({ type: "file", name, path: f.path });
  }

  sortChildrenRecursive(root);
  return root;
}

function sortChildrenRecursive(node: TreeNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) sortChildrenRecursive(child);
}

/** One row of the flattened, currently-visible tree — what the Files panel
 * actually renders and what j/k walks. */
export interface FlatTreeRow {
  type: TreeEntryType;
  name: string;
  path: string;
  /** 0 = top-level entry (direct child of the repo root). */
  depth: number;
  /** Only meaningful for dirs. */
  expanded?: boolean;
}

/** Flattens a tree into the rows currently visible given a `collapsedDirs` set; pass an empty set to show every descendant expanded. */
export function flattenVisible(
  root: TreeNode,
  collapsedDirs: ReadonlySet<string>,
  depth = 0,
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];
  for (const child of root.children ?? []) {
    if (child.type === "dir") {
      const expanded = !collapsedDirs.has(child.path);
      rows.push({ type: "dir", name: child.name, path: child.path, depth, expanded });
      if (expanded) rows.push(...flattenVisible(child, collapsedDirs, depth + 1));
    } else {
      rows.push({ type: "file", name: child.name, path: child.path, depth });
    }
  }
  return rows;
}
