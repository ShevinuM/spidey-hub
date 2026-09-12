// Generate-time-only syntax tokenization. Every export here runs during
// `scripts/generate.mjs` (Node, never bundled to the client): the returned
// token arrays are plain JSON written into public/generated/repos/<name>.json,
// so the browser never imports shiki itself.
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { ThemeRegistrationRaw } from "@shikijs/types";

/** [paletteIndex, text] — a run of same-colored characters. A line is an
 * array of these; joining every `text` in order reconstructs the plain
 * line verbatim (lossless — vim motions/search/yank rebuild raw text from
 * this instead of storing it twice). */
export type TokenSpan = [number, string];

/** Extension (lowercase, no dot) -> shiki language id. Extensions absent
 * from this map (markdown, plain text, and anything with no reasonable
 * grammar) always fall back to flat rendering — never an error. */
export const LANG_FOR_EXT: Record<string, string> = {
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "properties",
  xml: "xml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  svelte: "svelte",
  astro: "astro",
  vue: "vue",
  py: "python",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  gradle: "groovy",
  rb: "ruby",
  go: "go",
  rs: "rust",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "zsh",
  fish: "fish",
  ps1: "powershell",
  cmd: "batch",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  svg: "xml",
  fxml: "xml",
  env: "dotenv",
};

/** A small terminal colorscheme mapped onto the site's own accent palette
 * (docline.ts's heading red, bullet teal, code-block gold, plus a light
 * blue for types and a purple for constants) — not a stock theme, so every
 * tokenized file reads as part of the same UI rather than a pasted-in
 * editor. The no-scope entry is the default foreground for anything no
 * later rule matches. */
const THEME_NAME = "spideyhub-term";
const THEME: ThemeRegistrationRaw = {
  name: THEME_NAME,
  type: "dark",
  settings: [
    { settings: { foreground: "#c4d8e8" } },
    { scope: ["comment"], settings: { foreground: "#64798c" } },
    {
      scope: ["keyword", "keyword.control", "keyword.operator", "storage.type", "storage.modifier"],
      settings: { foreground: "#e0453c" },
    },
    { scope: ["string", "string.quoted"], settings: { foreground: "#d9b04a" } },
    {
      scope: ["constant.numeric", "constant.language", "constant.character.escape", "support.constant"],
      settings: { foreground: "#9a7fd4" },
    },
    {
      scope: ["entity.name.function", "support.function", "meta.function-call"],
      settings: { foreground: "#5fc6b4" },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "support.type",
        "support.class",
        "entity.other.inherited-class",
      ],
      settings: { foreground: "#8fd0f5" },
    },
    { scope: ["entity.name.tag"], settings: { foreground: "#5fc6b4" } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: "#8fd0f5" } },
  ],
};

const DEFAULT_COLOR = "#c4d8e8";

let highlighterPromise: Promise<HighlighterCore> | null = null;

/** One highlighter instance for the whole generate run — every grammar
 * needed by any extension in LANG_FOR_EXT is registered up front, deduped
 * by scopeName (composite grammars like astro/svelte/vue re-export the same
 * embedded js/css/ts grammars, which createHighlighterCore rejects twice). */
function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const modNames = new Set(Object.values(LANG_FOR_EXT));
      const seenScopes = new Set<string>();
      const grammars: unknown[] = [];
      for (const name of modNames) {
        const mod = (await import(`@shikijs/langs/${name}`)) as { default: unknown };
        const arr = Array.isArray(mod.default) ? mod.default : [mod.default];
        for (const g of arr) {
          const scopeName = (g as { scopeName: string }).scopeName;
          if (seenScopes.has(scopeName)) continue;
          seenScopes.add(scopeName);
          grammars.push(g);
        }
      }
      return createHighlighterCore({
        themes: [THEME],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        langs: grammars as any,
        engine: createJavaScriptRegexEngine(),
      });
    })();
  }
  return highlighterPromise;
}

/** Per-repo palette accumulator: dedupes hex colors across every file in one
 * repo JSON so `[paletteIndex, text]` pairs share one small color array
 * instead of repeating hex strings per line. A fresh instance per repo. */
export class PaletteBuilder {
  private colors: string[] = [];
  private indexOf = new Map<string, number>();

  indexFor(hex: string): number {
    let i = this.indexOf.get(hex);
    if (i === undefined) {
      i = this.colors.length;
      this.colors.push(hex);
      this.indexOf.set(hex, i);
    }
    return i;
  }

  get palette(): string[] {
    return this.colors;
  }
}

function mergeLine(line: { content: string; color?: string }[], palette: PaletteBuilder): TokenSpan[] {
  const out: TokenSpan[] = [];
  for (const tok of line) {
    const color = (tok.color ?? DEFAULT_COLOR).toLowerCase();
    const idx = palette.indexFor(color);
    const last = out[out.length - 1];
    if (last && last[0] === idx) {
      last[1] += tok.content;
    } else {
      out.push([idx, tok.content]);
    }
  }
  return out;
}

/** Plain text reconstructed from one tokenized line — the inverse of
 * tokenization, used everywhere a caller needs raw text back (vim motions,
 * previews, shell cat/vim) instead of storing both forms. */
export function tokenLineText(line: TokenSpan[]): string {
  return line.map(([, text]) => text).join("");
}

/**
 * Tokenizes `text` (already known to be `ext`'s language) into per-line
 * token arrays, or `null` when the extension has no grammar, `text` exceeds
 * `sizeCapBytes`, or tokenization throws — every case is a flat-fallback
 * signal, never an error the caller must handle specially. The result is
 * ALWAYS verified lossless against `text` before being returned (a grammar
 * or line-splitting mismatch also falls back to `null` rather than shipping
 * a token stream vim's plain-text motions would disagree with).
 */
export async function tokenizeFile(
  ext: string,
  text: string,
  palette: PaletteBuilder,
  sizeCapBytes: number,
): Promise<TokenSpan[][] | null> {
  const lang = LANG_FOR_EXT[ext.toLowerCase()];
  if (!lang) return null;
  if (Buffer.byteLength(text, "utf8") > sizeCapBytes) return null;

  let tokenLines: TokenSpan[][];
  try {
    const highlighter = await getHighlighter();
    const raw = highlighter.codeToTokensBase(text, { lang, theme: THEME_NAME });
    tokenLines = raw.map((line) => mergeLine(line, palette));
  } catch {
    return null;
  }

  const sourceLines = text.split("\n");
  if (tokenLines.length !== sourceLines.length) return null;
  for (let i = 0; i < sourceLines.length; i++) {
    if (tokenLineText(tokenLines[i]) !== sourceLines[i]) return null;
  }
  return tokenLines;
}
