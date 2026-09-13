// Classifies raw markdown body lines into the prototype's rendering "kinds"
// (Homepage.dc.html Component.doc / Component.xp[].roles[].doc arrays use
// tuples of [text, kind]).
//
// Rules (mirrors the prototype's hand-authored kind arrays exactly — see
// src/common/tests/unit/docline.fixtures.json, extracted verbatim from the 4
// fixture project docs + 7 personnel role docs):
//   - a line starting with one or more "#" followed by a space -> "h"
//     (both "# Title" and "## Section" headings).
//   - project docs only: the single line immediately following a
//     "## Status" heading -> "c" (the status text itself).
//   - personnel docs only: line index 1 (the line right after the title,
//     e.g. "Enaimco · Toronto, ON · Jul 2024 – Present") -> "m".
//   - personnel docs only: a line whose content starts with a backtick
//     (the "`typescript` `node` ..." stack line) -> "c".
//   - a line starting with "- " -> "b" (bullets).
//   - everything else (including blank lines) -> "p".

export type DocKind = "h" | "m" | "p" | "b" | "c";
export type DocMode = "project" | "personnel";

const HEADING_RE = /^#{1,6}\s/;

export function classifyDoc(lines: string[], mode: DocMode): DocKind[] {
  const kinds: DocKind[] = [];
  let expectStatusLine = false;

  lines.forEach((line, i) => {
    let kind: DocKind;

    if (HEADING_RE.test(line)) {
      kind = "h";
      expectStatusLine = mode === "project" && line.trim() === "## Status";
    } else if (mode === "project" && expectStatusLine) {
      kind = "c";
      expectStatusLine = false;
    } else if (mode === "personnel" && i === 1) {
      kind = "m";
    } else if (line.startsWith("- ")) {
      kind = "b";
    } else if (mode === "personnel" && line.trimStart().startsWith("`")) {
      kind = "c";
    } else {
      kind = "p";
    }

    kinds.push(kind);
  });

  return kinds;
}

export interface DocLine {
  /** Rendered text — blank lines render as a single space, matching the
   * prototype (`l[0] === "" ? " " : l[0]`, Homepage.dc.html lines 1082/1108). */
  t: string;
  kind: DocKind;
}

/** Split a markdown body into lines and classify them in one step. */
export function classifyBody(body: string, mode: DocMode): DocLine[] {
  // Content collections hand us the body with a single trailing newline;
  // split-then-drop-one-trailing-empty-line keeps the line count identical
  // to the source doc arrays (see src/features/repositories/tests/ui/support/repositories/*.md, generated with
  // `doc.map(l => l[0]).join("\n") + "\n"`).
  const raw = body.replace(/\n$/, "").split("\n");
  const kinds = classifyDoc(raw, mode);
  return raw.map((text, i) => ({ t: text === "" ? " " : text, kind: kinds[i] }));
}

// Color maps — Homepage.dc.html Component.docColors / Component.xpColors
// (lines 496, 498), verbatim.
export const docColors: Record<DocKind, string> = {
  h: "color:#e0453c;font-weight:700",
  p: "color:rgba(196,216,232,.72)",
  b: "color:#5fc6b4",
  c: "color:rgba(217,176,74,.85)",
  // "m" never occurs in project docs; included so the Record is total.
  m: "color:rgba(217,176,74,.85)",
};

export const xpColors: Record<DocKind, string> = {
  h: "color:#e0453c;font-weight:700",
  m: "color:rgba(217,176,74,.85)",
  p: "color:rgba(196,216,232,.72)",
  b: "color:#5fc6b4",
  c: "color:rgba(154,127,212,.9)",
};

export function colorFor(kind: DocKind, mode: DocMode): string {
  return (mode === "project" ? docColors : xpColors)[kind];
}
