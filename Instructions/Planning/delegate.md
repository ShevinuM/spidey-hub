# Delegate to a package, not a bounded context

Five modules from v1's `src/lib/` where the right move is (or already was) reaching for an external package instead of hand-rolling — the DDD "generic subdomain" call: a solved, non-differentiating problem doesn't earn bespoke engineering effort, so buy/reuse and spend the effort on what actually makes this site *this* site (the terminal/tmux/vim emulation).

This is the mirror image of `docs/checklist/general/architecture.md`'s bounded-context rules: those are about where *your own* code lives; this doc is about which problems shouldn't become your own code at all.

## `helpSearch.ts` → delegate (not yet done — the one real action item here)

**What it does today:** hand-rolled fuzzy-match scoring for the `?` command palette — a tiered cascade (exact → prefix → word-boundary → substring → subsequence), with a hand-written Levenshtein distance as the tiebreak inside the fuzzy tier.

**Why this is a generic subdomain:** ranked fuzzy text matching is a solved, widely-used problem with mature, battle-tested implementations (`fuzzysort`, `Fuse.js`, the algorithm class behind `fzf`). None of the scoring logic here is specific to this site — the *corpus* is (commands before keymap rows, sourced from `cmdline.yaml`/`content/help`/`shell.yaml`), but the matching algorithm itself isn't.

**v2 plan:** pull in a small zero/near-zero-dependency fuzzy matcher (`fuzzysort` is the natural fit — no build step, plain JS, scores in the same tiered spirit) for the actual scoring. Keep as bespoke glue, thin and separate from the library call:
- building the two-shaped corpus (executable commands vs. informational keymap rows) from `cmdline.yaml`/`content/help/*.md`/`shell.yaml`,
- the tie-break-by-corpus-order rule (commands before keymap rows) for equal-score results — this is a product decision the library has no way to know, so it stays as a thin sort step *after* the library returns scores, not inside it.

Net effect: delete the hand-rolled cascade and Levenshtein implementation; keep everything about *what's searchable and in what order ties resolve*, since that's this site's own decision, not a generic one.

## `highlight.ts` → Shiki (already done — the reference example)

**What it does:** tokenizes each repo file's source into `[paletteIndex, text]` spans for the Repositories file preview, using a custom theme matched to the site's accent colors.

**What it delegates to:** [Shiki](https://shiki.style/) — a real TextMate-grammar-based syntax highlighter, via `@shikijs/langs`/`@shikijs/types` (already in `devDependencies`).

**Why this is correct:** language-aware syntax highlighting (knowing that `const` is a keyword in TypeScript but not in YAML, that a template literal can embed an expression, etc.) is exactly the kind of problem where hand-rolling would mean re-deriving grammars for a dozen languages — pure reinvention with a strictly worse result than an actively-maintained tokenizer. The only bespoke part kept — correctly — is the *theme* (this site's own accent-color mapping) and the *palette-dedup* output shape (`PaletteBuilder`), both of which are genuinely product-specific.

**v2 note:** carry this forward unchanged — same package, same "generate-time-only, never bundled to the client" boundary (`tech-stack/typescript.md`/`general/toolchain.md` don't currently name this constraint explicitly; worth adding to `general/architecture.md`'s shared-code rules if a v2 equivalent of `highlight.ts` is built, so the client-bundle boundary doesn't get lost in the rewrite).

## `fileIcons.ts` → material-file-icons (already done)

**What it does:** resolves a file path to an SVG icon glyph for the shell/file-tree UI, by exact filename match first (e.g. `package.json` gets its own icon), then by extension, then a generic fallback.

**What it delegates to:** [`material-file-icons`](https://www.npmjs.com/package/material-file-icons) (VS Code's Material Icon Theme icon set), consumed at *build time* by `scripts/generate.mjs`, which filters it down to only the icons this site actually shows and writes the curated subset to `src/generated/file-icons.json`. The runtime module (`fileIcons.ts`) only ever reads that generated JSON — it never imports the package itself.

**Why this is correct:** "which icon represents a `.rs` file" is a solved, actively-maintained, opinion-heavy dataset (hundreds of extensions, brand-name-to-icon mappings) — hand-maintaining an equivalent table would be pure upkeep cost with no differentiating value. Filtering to a curated subset at build time (rather than shipping the whole package to the client) is the right compromise: delegate the *data*, keep the *bundle size* under this site's own control.

**v2 note:** same pattern — package feeds `scripts/generate.mjs`, generated JSON is what ships. Don't let a future refactor import `material-file-icons` directly into runtime code as a shortcut.

## `data.ts` (YAML loading) → the `yaml` package (already done)

**What it does:** loads every `src/data/*.yaml` file (Vite `?raw` imports) and parses it into typed getters (`getSite()`, `getDashboard()`, etc.).

**What it delegates to:** the [`yaml`](https://www.npmjs.com/package/yaml) package for the actual parse.

**Why this is correct:** YAML's grammar (multiline strings, anchors/aliases, type coercion edge cases) is exactly the kind of spec-compliance problem not worth reimplementing for a handful of config files — a hand-rolled parser would either be incomplete (breaks on some valid YAML someone eventually writes) or would itself become a maintenance burden mirroring the spec. The only bespoke part — correctly — is the typed getter layer on top, which encodes *this site's* shape expectations, not YAML's.

## `content.config.ts` (schema validation) → Zod via `astro:content` (already done)

**What it does:** defines and validates the shape of every content collection (`repositories`, `personnel`, `profile`, `help`, `notifications`, `boot`, `command-log`).

**What it delegates to:** [Zod](https://zod.dev/), wired in through Astro's own `defineCollection`/`astro:content` — not a hand-rolled shape-checker.

**Why this is correct:** runtime schema validation with good error messages, type inference, and composable schemas is a solved, ecosystem-standard problem (Zod, Valibot, etc. all exist for exactly this). Hand-rolling equivalent validation-plus-TypeScript-type-inference would mean re-deriving both a validation engine and a type-level mapper from schema to `interface` — real effort spent on something with zero site-specific value. The site-specific part — correctly kept in-house — is *what the schemas say* (which fields a `repositories` doc needs), not the validation mechanism itself.

## The pattern across all five

Every module above that delegates well shares the same shape: **the external package solves the general-purpose mechanism (tokenize syntax, parse YAML, validate a shape, fuzzy-match a query); this site's own code stays limited to the product-specific *data* and *policy* around it** (which theme, which fields, which corpus, which tie-break). That split is the actual rule worth carrying into v2 — not "prefer packages" in general, but "the mechanism is generic, the policy is yours."
