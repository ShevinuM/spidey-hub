// Ports Homepage.dc.html's Component.grepHits() (lines 812-832) exactly:
// same empty-query shape, same path-then-content-hit ordering per file, same
// 400-row cap, same 24-char left-cut ellipsis/offset math, same trailing-
// whitespace trim.

export interface RepoFile {
  path: string;
  lines: string[];
}

export interface Hit {
  path: string;
  /** 1-based line number, or 0 for the synthetic "whole file" row (empty
   * query, or a path-substring match with no line hit). */
  line: number;
  /** 1-based column of the match start; 0 alongside line === 0. */
  col: number;
  /** Text before the match (or the "N lines" summary when line === 0). */
  pre: string;
  /** The matched substring itself, styled as a highlight by the caller. */
  mat: string;
  /** Text after the match. */
  post: string;
}

const LIMIT = 400;
/** How many characters of left context to keep before an ellipsis. */
const LEFT_CUT = 24;

/**
 * Search `files` for `query` (case-insensitive substring). An empty (or
 * whitespace-only) query returns one summary row per file: `{n} lines`.
 * Otherwise, for every file: a path-substring hit contributes one row (no
 * line/col, same "{n} lines" summary text), followed by one row per line
 * that contains the query, capped at 400 total rows across all files.
 */
export function search(files: RepoFile[], query: string): Hit[] {
  const q = query.trim().toLowerCase();

  if (!q) {
    return files.map((f) => ({ path: f.path, line: 0, col: 0, pre: `${f.lines.length} lines`, mat: "", post: "" }));
  }

  const out: Hit[] = [];
  for (const f of files) {
    const inPath = f.path.toLowerCase().indexOf(q);
    if (inPath !== -1) {
      out.push({ path: f.path, line: 0, col: 0, pre: `${f.lines.length} lines`, mat: "", post: "" });
    }
    for (let i = 0; i < f.lines.length; i++) {
      if (out.length >= LIMIT) return out;
      const raw = f.lines[i];
      const at = raw.toLowerCase().indexOf(q);
      if (at === -1) continue;
      const cut = Math.max(0, at - LEFT_CUT);
      const text = (cut ? "…" : "") + raw.slice(cut).replace(/\s+$/, "");
      const off = at - cut + (cut ? 1 : 0);
      out.push({
        path: f.path,
        line: i + 1,
        col: at + 1,
        pre: text.slice(0, off),
        mat: text.slice(off, off + q.length),
        post: text.slice(off + q.length),
      });
    }
  }
  return out;
}

/** Total line count across every file — the denominator of the `hits/total`
 * counter when a query is active (Component.renderVals() line 1043). */
export function totalLines(files: RepoFile[]): number {
  return files.reduce((n, f) => n + f.lines.length, 0);
}

/**
 * "{hits}/{total}" counter text: total is the file count for an empty
 * query, or the total line count across all files once a query is typed
 * (Component.renderVals() line 1043).
 */
export function formatCount(hits: Hit[], files: RepoFile[], query: string): string {
  const denominator = query.trim() ? totalLines(files) : files.length;
  return `${hits.length}/${denominator}`;
}
