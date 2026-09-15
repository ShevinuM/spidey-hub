# The five checks

Five commands check this repo without starting a browser. Each one is standalone and each exits 0 on a clean tree.

| command             | what it runs                                                         | what it checks                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`    | `astro check && tsc --noEmit && svelte-check --threshold error`      | Types, through the three compilers that each own part of the tree: `astro check` for `.astro` pages and their content-collection schemas, `tsc --noEmit` for the TypeScript program (`tsconfig.json` extends `astro/tsconfigs/strict` over `**/*`), and `svelte-check` for `.svelte` components including their template expressions. `--threshold error` prints hints and warnings without failing on them. |
| `pnpm lint`         | `oxlint --deny-warnings`                                             | oxlint's default rule set over the repo's `.ts`, `.js` and `.mjs` files, the `<script>` block of every `.svelte` file, and the frontmatter of every `.astro` file. `.oxlintrc.json` sets ignore patterns only. Findings print at warning severity and `--deny-warnings` turns any finding into a non-zero exit, so this one gates.                                                                           |
| `pnpm architecture` | `pnpm check:arch && depcruise src --no-cache --output-type err-long` | The layer boundaries, in two passes that are not interchangeable — see below.                                                                                                                                                                                                                                                                                                                                |
| `pnpm format`       | `prettier --check .`                                                 | Whether every non-exempt file already matches `.prettierrc`. `pnpm format:write` rewrites them instead of reporting. `.prettierignore` names what is exempt and why.                                                                                                                                                                                                                                         |
| `pnpm build`        | `astro build`                                                        | That the site builds. `prebuild` runs `scripts/generate.mjs` first, which rewrites `public/generated/**` and fetches the SHA-pinned repository tarballs into `.cache/`. Cold, with `.cache/` and `dist/` deleted, that is ~12s; warm ~4s; the tarball cache is 6.9M.                                                                                                                                         |

## `architecture` is two layers, and neither replaces the other

`pnpm check:arch` runs `tests/audits/boundaries.test.ts`, which scans source **text**. It owns **direct** edges across **every** file type, including the two classes no module resolver sees: `.astro` files, and Vite `?raw` query-suffixed specifiers.

`depcruise` resolves the module **graph**. It owns what no per-file scan can see: dependency cycles, and **transitive** reach — `features/<a>` → `common` → `features/<b>` — with `--output-type err-long` printing the intermediate hops that make such a finding actionable.

The graph layer has three known limitations. Each has one owner, which holds the measurement and the reasoning:

- `.astro` files do not appear in the cruise at all, and the obvious config fix makes it worse — `.dependency-cruiser.mjs`.
- A type-only import written inside a `.svelte` file produces no edge — also `.dependency-cruiser.mjs`.
- The cruise can go blind and stay green if the Svelte compiler stops resolving — `tests/audits/cruise-canary.test.ts` is the guard against it and explains the shape it has to take.

In each case the text scanner still catches the edge as a direct one. That is why both layers stay.

## The suites

These five are the static checks. Running the tests is a different altitude, with its own instructions:

- `pnpm test:unit` (`vitest run`) runs the unit tests and the audits — `check:arch` and the cruise guards among them.
- `e2e/running-tests.md` — `pnpm test:e2e`, and every narrower Playwright invocation.
- `visual/running-tests.md` — `pnpm test:visual`, the fixture build it needs, and the rebaselining procedure.
