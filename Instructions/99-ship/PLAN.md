# Phase 99 — ship

> **Status: planned, not started.** The repo is `ShevinuM/spidey-hub`; the working branch is **`frontend-rewrite`** (an **orphan** branch — no merge-base with `main`, so cherry-picks onto `main` will conflict wherever both histories touch the same paths; that is expected, reported, and never resolved by guessing). No force-push, rebase, or history rewrite — ever.

## Context

The repo's history. Runs only when the developer asks, and only over closed phases.

**Two landing mechanisms now exist; the choice is the developer's at ship time (D25).** (a) The cherry-pick pass below — closed-phase commits replayed onto `main`, oldest first, conflicts surfaced here. (b) Squash-merging phase 04b's stack PRs bottom-up, giving `main` one commit per phase, with `gh stack sync` restacking after each merge; the per-phase conflicts are then already resolved on the `stack/*` branches instead of being met here. They are alternatives, not steps of one plan — do not run both over the same phases. If (b) is chosen, this plan's steps 4–5 (verify `main` whole; red `main` = FAIL fixed on `frontend-rewrite`, never patched on `main`) still apply after the last PR merges.

## Objective

Every closed phase's `frontend-rewrite` commits land on `main`, oldest first, with `main` verified whole.

## Steps

- [ ] **1.** Verify preconditions: `frontend-rewrite` + `main` present, clean working tree. Any missing → report blocked, stop.
- [ ] **2.** Identify closed-phase commits on `frontend-rewrite` not on `main` (`git log main..frontend-rewrite --oneline`, cross-checked against 00-phases.md statuses).
- [ ] **3.** Cherry-pick onto `main`, oldest first. On any conflict: stop, report the conflicting paths — never resolve by guessing (orphan-branch note above: expect this).
- [ ] **4.** Verify `main` itself, full scope (no narrower context): `pnpm check` + lint + `pnpm test:unit` + the D20 two-invocation Playwright gate — `main` carries v1 code the phases never touched, so a scoped run proves nothing.
- [ ] **5.** Red `main` = FAIL handed back to the executor on `frontend-rewrite`; fix there, re-ship. Never patch `main` directly.

## Acceptance criteria

`main` carries all closed-phase commits; step 4 fully green on `main`; 00-phases.md updated. Pushing to origin happens only on the developer's say-so.

## Results

(executor fills in)
