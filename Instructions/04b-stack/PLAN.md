# Phase 04b — stack mirror

> **Status: planned, not started.** Inserted after phase 04 (developer proposal 2026-09-08); phases 05–11 are **not** renumbered. Runs only when the developer asks. Binding decisions: `Instructions/00-phases.md` (this phase is governed by **D25**). This phase changes **no** application code — its whole output is branches, PRs, and this file's Results.

## Context

**Out of context** (repo history + the GitHub PR surface). Touched surface: git refs under `stack/*`, a local `main`, and pull requests on `ShevinuM/spidey-hub`. Zero files under `src/`, `common/`, `tests/`, `fixtures/`, or `docs/` are edited by this phase. It is not a migration phase: it neither moves code nor owns a bounded context, and it is **not** a predecessor of phase 05 — phase 05 may start whether or not this phase has run.

## Objective

A parallel, reviewable **mirror** of `frontend-rewrite` exists as a stack of branches and PRs — one branch per closed phase, each based on the previous phase's branch, carrying that phase's full atomic commit history — with every branch tip proven tree-equivalent to the corresponding `frontend-rewrite` commit. Nothing merges. `frontend-rewrite` remains the one active working branch, unchanged.

## Background

### Why a mirror rather than a replacement

`frontend-rewrite` is an **orphan** branch: no merge-base with `main` (`git merge-base origin/main frontend-rewrite` → empty). The original single landing mechanism is phase 99, one cherry-pick pass at the very end. That defers all conflict resolution and all review to one big-bang step. This phase adds a second, non-destructive artifact alongside it: a stack whose PR boundaries are phase boundaries, so each phase is reviewable on its own diff, with CI (when it exists) able to run per layer. It does **not** eliminate the conflicts — it front-loads them, once per phase, under a stated resolution policy with a machine-checkable correctness gate (below).

### Stack layout

```
main (trunk, = origin/main)
 └── stack/01-pre-phase   → PR (base: main)
  └── stack/02-common     → PR (base: stack/01-pre-phase)
   └── stack/03-profile   → PR (base: stack/02-common)
    └── stack/04-help     → PR (base: stack/03-profile)     ← top today
     └── stack/05-boot    → appended when phase 05 closes
      └── …
```

Branch names are used verbatim by `gh stack` (no prefixing or transformation). The stack is built **retroactively from the pre-phase**, per the developer's instruction — phases 01–04 first, later phases appended at their close.

### Commit boundaries (77 commits on `frontend-rewrite`, all local except what is already on `origin/frontend-rewrite`)

History is linear and phases ran sequentially, so each phase owns a **contiguous** range. Assignment rule: ranges split at each phase's closing commit; **every commit is assigned to exactly one phase and none is dropped** (26 + 14 + 19 + 18 = 77 ✓ against `git rev-list --count frontend-rewrite`).

| stack branch | phase | first commit | last commit | commits |
|---|---|---|---|---|
| `stack/01-pre-phase` | 01 pre-phase | `ec28009` Start frontend-rewrite: bounded-context planning docs and checklist | `40388a7` Update phase plans: harness steps, D23-24 rulings, phase 01 closed | 26 |
| `stack/02-common` | 02 common | `4d7969e` Port kernel+editor specs and visual infra to common (D21) | `8b1675d` Record post-verification audit round results in PLAN.md | 14 |
| `stack/03-profile` | 03 profile | `b6fc6c5` Approve phases 03-04 and align phase 03 plan with settled D21 | `b741bd2` Mark phase 03 closed in the phase index | 19 |
| `stack/04-help` | 04 help | `99d2a54` Port help specs and goldens to src/features/help | `57287a1` Fix stale path references in help/cmdline yaml comments | 18 |

`ec28009` is `frontend-rewrite`'s **root** commit (orphan). Cherry-picking a root commit is fine — `git cherry-pick` applies its diff-against-the-empty-tree, which is why step 3 is the one large conflict of this phase.

### Where the conflicts are, and how big

`origin/main` carries v1's own history; phase 01's `bb87af6` bulk-imports the v1 **working tree**. Measured today:

- **243** paths exist on both `origin/main` and `frontend-rewrite` with differing content → these surface as add/add or delete/modify conflicts during step 3's cherry-picks.
- The **allowed leftover set** — paths present on `origin/main` that **no mirrored commit ever touched** — is **19** at every one of the four phase ends: `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/agent-checklist.md`, `docs/architecture.md`, `docs/how-to-run.md`, `docs/project-structure.md`, and the twelve `docs/screenshots/*.png`. Compute it per phase with:
  ```bash
  comm -23 <(git ls-tree -r --name-only origin/main | sort) \
           <(git log --format= --name-only <phase-end-sha> | sort -u)
  ```
  (`git log <sha>` walks the whole orphan history, root included, so it lists every path any mirrored commit touched.)
- Background color only, **not** a criterion: a plain tree comparison (`origin/main` vs the phase-end tree) shows a growing 21 / 115 / 123 / 153 main-only paths at `40388a7` / `8b1675d` / `b741bd2` / `57287a1`. Those counts include files `frontend-rewrite` **imported and then moved** (`src/components/Profile.svelte`, `tests/e2e/fixtures.ts`, …). On the stack branches the move commits' delete side replays, so those files disappear from the stack tips too and do **not** show up in the tip diff — which is why the real expected diff is the flat 19, not the growing sequence.

The 19 never-touched files **stay** on the stack branches: the mirror never deletes `main`'s own content to force a match. Files v1 had and the migration moved are a different case — their deletion on the stack is **correct and required**, because that is what makes an eventual squash-merge remove v1's old paths from `main` rather than leaving two copies.

### Conflict resolution is policy, not judgment

Phase 99's never-resolve-by-guessing rule stands. It is satisfied here by a *stated, verifiable policy* instead of per-conflict judgment:

> **For every `stack/*` cherry-pick, a conflict resolves to `frontend-rewrite`'s side.** Correctness is proven by the tree-equivalence gate, never by reading the conflict. `main`'s content is superseded by design — D1 makes the v1 working tree the baseline, and the migration's whole intent is that v2's tree replaces v1's.

Mechanically: `git cherry-pick -X theirs <sha>` (or resolve with `git checkout --theirs` / `git checkout <sha> -- <path>` when `-X theirs` leaves a path unresolved), then the gate below. Any conflict the policy cannot resolve — a path where `frontend-rewrite` has no side at all, e.g. a delete/delete or rename edge case — is **reported, not guessed**, and stops the phase.

### The tree-equivalence gate (this phase's real verification)

After cherry-picking commit `X` of a phase onto its stack branch:

```bash
git diff --name-only <stack-branch> <X>
```

Every path listed must be a path that exists on `origin/main` and has **not been touched by any mirrored commit** — computed with the `comm` recipe above using the commits mirrored **so far** rather than the phase-end SHA. That set starts as all of `origin/main` (before `bb87af6` imports anything) and shrinks monotonically to the 19 at each phase tip. **Anything else is a mis-resolution.** Checking per commit is nearly free and pins a mis-resolution to the commit that caused it; checking only per phase tip is the required minimum.

Because a branch tip that is tree-equivalent to an already-verified `frontend-rewrite` commit is the same tree the verifier already ran green, the suites do **not** need re-running per branch. One full-suite run on the top branch covers the only genuinely new thing: the leftover delta (step 8).

### gh-stack facts (verified 2026-09-08)

- `gh` is v2.100.0 and authenticated as `ShevinuM` with `repo` scope. **`gh-stack` is NOT installed** (`gh extension list` is empty) — installing it is a precondition step, not an assumption.
- One remote (`origin`), so `remote.pushDefault` is optional; `rerere.enabled` is unset and gets set to avoid an interactive prompt on `init`.
- All commands run non-interactively: `gh stack view --json` (never bare — bare launches a TUI), `gh stack submit --auto`, and explicit branch arguments to `init`/`add`/`checkout`.
- `gh stack init` **adopts existing branches** — the stack is built with plain `git cherry-pick` first and adopted afterwards, which keeps conflict handling in ordinary git.
- `gh stack push`/`submit` push with `--force-with-lease --atomic`. That force-push is confined to `stack/*` (see D25).
- **Open question from the proposal — resolved:** `gh stack sync` automates restack-after-squash-merge. It detects that a PR was squash-merged, fast-forwards the trunk, and uses `git rebase --onto` to replay the remaining branches (skipping the merged one), then pushes. So the eventual merge loop is: merge the bottom PR → `gh stack sync` → repeat. No manual restack step is needed. A conflict during that rebase restores all branches to their pre-rebase state and exits with code 3.
- If the repository does not have stacked PRs enabled, `gh stack submit` exits with **code 9** in non-interactive mode. Fallback (chosen, not improvised): open plain PRs with explicit bases — `gh pr create --base <parent-branch> --head <stack-branch> --draft` — since the mirror's review value survives without GitHub's Stack UI. Record which path was taken in Results.

## Steps

- [ ] **1. Preconditions — check, then install only what this plan authorizes.**
  `git status` clean; `origin/frontend-rewrite` and `origin/main` present; `gh auth status` OK. Install the extension and set the non-interactive git config:
  ```bash
  gh extension install github/gh-stack
  git config rerere.enabled true
  ```
  *Verify:* `gh stack --help` runs as a real command (not the "available as an official extension" hint); `git config --get rerere.enabled` → `true`. Any precondition missing → report blocked, stop.

- [ ] **2. Create the local trunk.** `main` does not exist locally (only `origin/main`).
  ```bash
  git branch main origin/main      # additive; fast-forward-only from here on
  ```
  This is the **one** branch creation outside `stack/*` that this phase is authorized to make (D25) — recorded here so it is an approved step, not an improvised deviation from phase 99's don't-create-branches rule.
  *Verify:* `git rev-parse main` == `git rev-parse origin/main` (`5fb3f79` at time of writing); `git log -1 --oneline main` matches `origin/main`.

- [ ] **3. Build `stack/01-pre-phase`.** `git switch -c stack/01-pre-phase main`, then cherry-pick `ec28009` … `40388a7` **in order**, one at a time, applying the resolution policy. This step carries essentially all of the phase's conflict cost (the 243-path add/add collision at `bb87af6`).
  *Verify:* per-commit `git diff --name-only stack/01-pre-phase <sha>` lists only paths untouched by the commits mirrored so far; at the tip, that diff equals exactly the 19-path leftover set listed in Background; `git rev-list --count main..stack/01-pre-phase` == 26; every cherry-picked commit's message is byte-identical to its source (`git log --format=%s`), since commit discipline (single-line, no body, no trailer) must survive the mirror.

- [ ] **4. Build `stack/02-common`.** `git switch -c stack/02-common stack/01-pre-phase`; cherry-pick `4d7969e` … `8b1675d` in order.
  *Verify:* same gate; tip diff vs `8b1675d` == the 19-path leftover set; count == 14.

- [ ] **5. Build `stack/03-profile`.** `git switch -c stack/03-profile stack/02-common`; cherry-pick `b6fc6c5` … `b741bd2` in order.
  *Verify:* same gate; tip diff vs `b741bd2` == the 19-path leftover set; count == 19.

- [ ] **6. Build `stack/04-help`.** `git switch -c stack/04-help stack/03-profile`; cherry-pick `99d2a54` … `57287a1` in order.
  *Verify:* same gate; tip diff vs `57287a1` == the 19-path leftover set; count == 18. Also assert the goldens survived the mirror byte-for-byte: `git diff --name-only stack/04-help 57287a1 -- '**/goldens/**'` is empty (D5 forbids any golden churn, mirror included).

- [ ] **7. Adopt the stack and open the PRs — draft, never merged.**
  ```bash
  gh stack init --base main stack/01-pre-phase stack/02-common stack/03-profile stack/04-help
  gh stack submit --auto            # drafts; do NOT pass --open
  gh stack view --json
  ```
  On exit code 9, use the plain-PR fallback from Background. PR bodies/titles are auto-generated; a phase's PR body may be improved by hand to point at its `Instructions/<phase>/PLAN.md`, but no PR is marked ready-for-review and **none is merged in this phase**.
  *Verify:* `gh stack view --json` shows 4 branches in the stated order, each with a PR, each PR's base = the branch below it (`main` for the bottom), `isMerged: false` for all four; `gh pr view <n> --json isDraft` → `true`; `git rev-parse origin/frontend-rewrite` unchanged; `git rev-parse main` still == `origin/main`.

- [ ] **8. One full-suite gate, on `stack/04-help` only.** Check out the top branch and run the whole D20 two-invocation gate plus `pnpm check` and `pnpm lint` — this is the single run that covers the leftover delta (the 19 `main`-only files riding along, which no verifier has ever seen next to v2 code).
  *Verify:* `pnpm check` 0 errors, `pnpm lint` 0 errors, `pnpm test:unit` green, D20 (a) real build → smoke + all e2e projects green, D20 (b) fixture build → all `*-visual` + legacy visual green, with zero golden churn (`git status` clean afterwards). Red here is a **finding about the leftovers**, reported with the failing output; it does not reopen phases 01–04 and is never fixed by editing a `stack/*` branch's mirrored commits.

- [ ] **9. Record and index.** Fill in Results below (branch → PR number, commits mirrored, conflicts resolved per commit, leftover-set sizes actually observed, which submit path was taken, step 8 output). Mark this phase closed in `Instructions/00-phases.md`. Commit the doc updates to **`frontend-rewrite`** per the standing commit discipline.
  *Verify:* Results has one row per branch and no `(executor fills in)` placeholder; 00-phases.md's `04b` row reads **closed**.

- [ ] **10. Standing sync obligation (recurs; not part of closing this phase).** At the close of each later phase `NN`, from the top of the stack:
  ```bash
  gh stack top                        # check out the current top branch
  gh stack add stack/<NN>-<name>      # CREATES the branch at the top and switches to it
  # cherry-pick that phase's commit range onto it, policy + gate per steps 3-6
  gh stack submit --auto
  ```
  Order matters: `gh stack add` *creates* the branch (only `gh stack init` adopts existing ones), so never pre-create it with `git switch -c`.
  Cadence is **once per phase close** — never per commit. Per-commit mirroring would re-resolve the same v1→v2 restructuring conflicts on every commit for no benefit, since nothing merges in the interim. **Non-blocking by rule (D25):** a sync conflict or a red gate on a `stack/*` branch is reported and does not reopen the closed phase, does not gate the next migration phase, and never stalls `frontend-rewrite`.

## Eventual merge strategy (deferred — the developer's call, not this phase's)

Recorded so it isn't re-derived later; **nothing here runs in this phase**. Each PR squash-merges into `main`, giving `main` one commit per phase while the stack branches keep the atomic detail for review and bisect. Because the PRs are stacked, the loop is: merge the bottom PR on GitHub → `gh stack sync` (detects the squash-merge, fast-forwards `main`, `rebase --onto`s the remaining branches, pushes) → merge the next. `gh stack sync --prune` cleans up local branches for merged PRs. This is an alternative to phase 99's raw cherry-pick pass, and the choice between them belongs to the developer at ship time (see `Instructions/99-ship/PLAN.md`).

## Acceptance criteria

1. Four branches exist — `stack/01-pre-phase`, `stack/02-common`, `stack/03-profile`, `stack/04-help` — each based on the previous, bottom based on `main`.
2. Each branch carries its phase's **full atomic commit history**, in order, with unchanged commit messages and the exact commit counts in the boundary table (26 / 14 / 19 / 18; 77 total).
3. Tree-equivalence holds at every branch tip: `git diff --name-only <tip> <phase-end-sha>` lists only paths present on `origin/main` and untouched by the commits mirrored so far. Zero golden churn.
4. Four draft PRs exist with correctly chained bases; **none merged**, none ready-for-review.
5. Step 8's full gate is green on `stack/04-help`, or its failure is reported with output as a leftover-delta finding.
6. `frontend-rewrite` and `main` are byte-identical to where they started: same tips, no force-push, no rewrite, no merge.
7. Results filled in; `00-phases.md` updated.

## Stop conditions

- **No application code changes.** If making the stack green would require editing `src/`, `common/`, `tests/`, or `fixtures/`, stop and report — that is a finding, not a task.
- **No history rewrite of `frontend-rewrite` or `main`**, no merge into `main`, no PR merged, no `--open`, ever in this phase.
- **No squashing** at build time — the atomic commits are the deliverable.
- **No golden regeneration**, no `--update-snapshots` (D5).
- A conflict the resolution policy cannot decide → report and stop.
- Do not extend the stack past phase 04 in this phase; later phases append via step 10.

## Results

(executor fills in)
