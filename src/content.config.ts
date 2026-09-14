// Content collections (Astro 7 / astro:content).
//
// `repositories` and `personnel` are both fixture-switched: under
// PORTFOLIO_FIXTURES=1 (set by `pnpm build:fixtures` / the visual-regression
// harness) each loads its fixture tree — 4 sample repos extracted verbatim
// from Homepage.dc.html instead of the 8 real ones, a fictional employment
// history instead of the user's real one — so 100% pixel comparisons against
// the goldens are possible without real resume data ever reaching a
// fixture/visual build. See src/common/lib/commits.ts for how matching
// per-repo commit snapshots are resolved the same way.
//
// Personnel content is a variable-depth, path-driven tree
// (`enaimco/software-developer/{role.md, full-time/role.md,
// part-time/role.md, co-op/role.md}` and `memorial-university/<role-slug>/
// role.md` × 5, mirrored in fixture mode by `oscorp/research-technician/...`
// and `damage-control/<role-slug>/role.md` × 5); EmploymentRecords.svelte
// derives the whole tree from each entry's `filePath`, and a role's position
// in the tree comes entirely from its directory path.
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
    base: useFixtures ? "src/features/repositories/tests/ui/support/repositories" : "src/features/repositories/content/repositories",
    // Astro's default generateId lowercases the slug, silently turning
    // "SafePass.md" into "safepass" — wrong once the Repositories Files
    // panel renders `${project.id}.md` as the displayed filename; this uses
    // the entry's own basename verbatim, case and all, instead.
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
    base: useFixtures ? "src/features/employment/tests/ui/support/personnel" : "src/features/employment/content/personnel",
    // Same rationale as `repositories` above: preserves the on-disk relative
    // path (minus extension) as-is rather than trusting Astro's slugify step.
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
