// Content collections (Astro 7 / astro:content, PLAN.md Phase 2 item 1).
//
// `projects` is fixture-switched: when PORTFOLIO_FIXTURES=1 (set by
// `pnpm build:fixtures` / the visual-regression harness) it loads the 4
// sample projects extracted verbatim from Homepage.dc.html instead of the 3
// real ones, so 100% pixel comparisons against the prototype's goldens are
// possible (PLAN.md "Fixture strategy"). See src/lib/commits.ts for how the
// matching per-repo commit snapshots are resolved the same way.
//
// `personnel` does NOT fixture-switch: the prototype's `xp` sample data
// *is* the real content (Enaimco/Vretta/Ontario-Tech/Freelance, extracted
// verbatim into src/content/personnel/**), so both modes read the same
// directory. `fixtures/personnel` deliberately does not exist — see
// PLAN.md Phase 2 item 3.
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const useFixtures = process.env.PORTFOLIO_FIXTURES === "1";

const repoSchema = z.object({
  name: z.string(),
  github: z.string(),
  branch: z.string(),
});

const projects = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: useFixtures ? "fixtures/projects" : "src/content/projects",
    // Astro's default `generateId` lowercases the slug (getContentEntryIdAndSlug's
    // slugify step), which silently turns "SafePass.md" into entry id
    // "safepass" — invisible until Phase 5's Builds Files panel started
    // rendering `${project.id}.md` as that file's displayed name (PLAN.md
    // Phase 5 scope item 1: "one row per project .md"), where it renders as
    // the wrong filename ("safepass.md" instead of "SafePass.md"). All of
    // our project filenames are already the exact string we want to display
    // (see fixtures/projects/*.md and src/content/projects/*.md), so this
    // just uses the entry's own basename verbatim, case and all.
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    repos: z.array(repoSchema).min(1),
  }),
});

const personnel = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "src/content/personnel",
  }),
  schema: z.object({
    company: z.string(),
    role: z.string(),
    months: z.string(),
    dates: z.string(),
    loc: z.string(),
    order: z.number(),
  }),
});

export const collections = { projects, personnel };
