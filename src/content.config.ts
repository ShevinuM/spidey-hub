// Content collections (Astro 7 / astro:content).
//
// `repositories` is fixture-switched: when PORTFOLIO_FIXTURES=1 (set by
// `pnpm build:fixtures` / the visual-regression harness) it loads the 4
// sample projects extracted verbatim from Homepage.dc.html instead of the 3
// real ones, so 100% pixel comparisons against the prototype's goldens are
// possible. See src/lib/commits.ts for how the
// matching per-repo commit snapshots are resolved the same way.
//
// `personnel` IS fixture-switched (Phase 7b.2), the same way `repositories`
// is just above: `fixtures/personnel/*` under `PORTFOLIO_FIXTURES=1`,
// `src/content/personnel/` (the user's real employment history) otherwise.
// This was NOT the case before 7b.2 — real employment copy used to leak
// into every fixture/visual-golden build, which also meant an adversarial
// (long/overflowing) record could never be added without corrupting the
// user's actual resume. `fixtures/personnel/` mirrors the real tree's
// variable-depth SHAPE (see below), not just its record count.
//
// Personnel content is a
// variable-depth, path-driven tree (`enaimco/software-developer/{role.md,
// full-time/role.md, part-time/role.md, co-op/role.md}` and
// `memorial-university/<role-slug>/role.md` × 5 — mirrored in fixture mode
// by `oscorp/research-technician/{role.md,co-op,full-time,part-time}` and
// `damage-control/<role-slug>/role.md` × 5) — EmploymentRecords.svelte
// derives the whole tree from each entry's `filePath`, so grouping is no
// longer a frontmatter concern. The old `company`/`employmentType` fields
// (used by the fixed 3-level company->type->role model) are gone; a role's
// position in the tree comes entirely from its directory path now.
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const useFixtures = process.env.PORTFOLIO_FIXTURES === "1";

const repoSchema = z.object({
  name: z.string(),
  github: z.string(),
  branch: z.string(),
});

const repositories = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: useFixtures ? "fixtures/repositories" : "src/content/repositories",
    // Astro's default `generateId` lowercases the slug (getContentEntryIdAndSlug's
    // slugify step), which silently turns "SafePass.md" into entry id
    // "safepass" — invisible until the Repositories Files panel started
    // rendering `${project.id}.md` as that file's displayed name, where it
    // renders as the wrong filename ("safepass.md" instead of "SafePass.md"). All of
    // our project filenames are already the exact string we want to display
    // (see fixtures/repositories/*.md and src/content/repositories/*.md), so this
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
    base: useFixtures ? "fixtures/personnel" : "src/content/personnel",
    // Same rationale as `projects` above: directory/file names in this tree
    // are already the literal, lowercase strings we want to display, so this
    // just preserves the on-disk relative path (minus extension) as-is rather than trusting
    // Astro's default slugify step.
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    // Display title for the role (e.g. "Software Developer",
    // "Research Assistant") — the source data file's role titles verbatim
    // or lightly shortened, never invented.
    role: z.string(),
    dates: z.string(),
    loc: z.string(),
    order: z.number(),
  }),
});

const profileFieldSchema = z.object({
  label: z.string(),
  value: z.string().optional(),
  valuePrefix: z.string().optional(),
  linkText: z.string().optional(),
  linkHref: z.string().optional(),
});

const profile = defineCollection({
  loader: glob({
    pattern: "*.md",
    base: "src/features/profile/content",
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    header: z.object({ badge: z.string(), fileClearance: z.string() }),
    title: z.object({ name: z.string(), subtitle: z.string() }),
    images: z.object({
      portrait: z.object({ alt: z.string(), caption: z.string() }),
      field: z.object({ alt: z.string(), caption: z.string() }),
      retinaV: z.object({ alt: z.string(), caption: z.string() }),
    }),
    fields: z.array(profileFieldSchema),
    dossierHeading: z.string(),
    recordDatabase: z.object({
      title: z.string(),
      stats: z.array(z.object({ label: z.string(), value: z.number() })),
    }),
    cv: z.object({
      title: z.string(),
      fileLabel: z.string(),
      meta: z.string(),
      hintPrefix: z.string(),
      hintKey: z.string(),
      hintSuffix: z.string(),
      href: z.string(),
    }),
    contact: z.object({
      title: z.string(),
      rows: z.array(
        z.object({
          icon: z.string(),
          alt: z.string(),
          text: z.string(),
          href: z.string().nullable(),
        }),
      ),
    }),
    education: z.object({
      title: z.string(),
      rows: z.array(
        z.object({ degree: z.string(), school: z.string(), loc: z.string(), dates: z.string() }),
      ),
    }),
    signal: z.object({ label: z.string(), coords: z.string(), initialReadout: z.string() }),
  }),
});

const help = defineCollection({
  loader: glob({
    pattern: "*.md",
    base: "src/features/help/content",
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    label: z.string(),
    hint: z.string(),
    order: z.number(),
    rows: z.array(
      z.object({
        name: z.string(),
        desc: z.string(),
        keys: z.array(z.string()),
      }),
    ),
  }),
});

const notifications = defineCollection({
  loader: glob({
    pattern: "*.md",
    base: "src/features/notifications/content",
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    sev: z.enum(["alert", "warn", "info"]),
    title: z.string(),
    src: z.string(),
    order: z.number(),
  }),
});

const boot = defineCollection({
  loader: glob({
    pattern: "*.md",
    base: "src/features/boot/content",
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    entries: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        val: z.string(),
      }),
    ),
  }),
});

export const collections = {
  repositories,
  personnel,
  profile,
  help,
  notifications,
  boot,
};
