# The five checks

Five commands check this repo without starting a browser. Each one is standalone and each exits 0 on a clean tree. (The CI gate also runs `pnpm duplication` and `pnpm knip`, two more browserless, exit-0-on-clean commands — see "What CI runs" below; they are gate-only additions, not part of this five.)

| command             | what it runs                                                         | what it checks                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`    | `astro check && tsc --noEmit && svelte-check --threshold warning`    | Types, through the three compilers that each own part of the tree: `astro check` for `.astro` pages and their content-collection schemas, `tsc --noEmit` for the TypeScript program (`tsconfig.json` extends `astro/tsconfigs/strict` over `**/*`), and `svelte-check` for `.svelte` components including their template expressions. `--threshold warning` fails on warnings as well as errors; hints still print without failing the command. |
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

## What CI runs

`.github/workflows/ci.yml` runs on every pull request and, for one of its two jobs, on every push to `main`; the `gate` job carries `if: github.event_name == 'pull_request'` and is the gate. It runs all five checks above in the order this file lists them, then two more gate-only commands not in that table — `pnpm duplication` (jscpd, gating `src` duplication at 1%) and `pnpm knip` (unused files, dependencies and exports) — then `pnpm test:unit --coverage`, then `pnpm test:e2e`. The `--coverage` flag measures statement coverage over `src/common/lib/**`, `src/common/engines/**`, `src/features/*/lib/**` and `scripts/lib/**` — the plain-TypeScript surface unit tests actually exercise, scoped there because Svelte components emit no V8 instrumentation and are covered by Playwright instead. Reporters are `text` and `lcov`, so the run also writes `coverage/lcov.info`.

The `gate` job also runs two blocking security scanners, ahead of the checks above since they are the cheapest failures to catch: [Gitleaks](https://github.com/gitleaks/gitleaks-action) scans the pull request's commit range for secrets, and [Trivy](https://github.com/aquasecurity/trivy-action) (scoped to `scanners: vuln` only) scans dependencies for known vulnerabilities. A third workflow, `.github/workflows/codeql.yml`, runs [CodeQL](https://codeql.github.com/) on every pull request as SAST, producing two independent check runs — `CodeQL (javascript-typescript)` and `CodeQL (actions)`, the latter scanning this repo's own workflow files. Each signal has exactly one blocking owner: Gitleaks for secrets (GitHub's native secret scanning runs alongside it, non-blocking), Trivy for dependencies (Dependabot, once added, opens remediation PRs but does not gate one), and CodeQL for SAST. Neither CodeQL nor Codacy reads `.svelte`, so component-level SAST coverage is nil — a loss, not a closed gap, accepted for a static site with no backend, auth or API surface.

The workflow's second job, `coverage`, runs `pnpm test:unit --coverage` and uploads `coverage/lcov.info` to Codacy. It runs on pull requests and on pushes to `main`, because Codacy computes diff coverage by comparing the head commit against the pull request's common ancestor — with no coverage uploaded for `main` there is nothing to diff against and it reports coverage as missing. It is a separate job from `gate` deliberately: an upload failure or a Codacy outage must not be able to fail the check that gates merges. Codacy is informational here and owns three things — diff coverage, cyclomatic complexity and the grade trend — over the surface `.codacy.yaml` narrows to the product by excluding the test suite, the lockfile and the generated trees.

`.github/workflows/deploy.yml` runs on every push to `main` and only builds and deploys — its `pnpm build` produces the `dist/` that publishes to GitHub Pages. The gate already ran on the pull request, which is why it is not repeated there.

Neither workflow runs `pnpm test:visual`. The goldens are captured on macOS and compared at `maxDiffPixels: 0`, and a Linux runner rasterizes text differently, so every golden would fail there on a clean tree. The visual suite is a local pre-push gate until [issue #2](https://github.com/ShevinuM/spidey-hub/issues/2) moves golden authority to an environment both CI and a developer can reproduce.
