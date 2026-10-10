# Branch protection for `main`

Recorded here, not just run once from a shell, so the configuration is reproducible from
the repo. **None of this is applied by PR 4.6.** Branch protection is a `gh api` call
against repository configuration, not a file in a diff, and a required status check can
only be registered after the workflow producing it has merged to `main` (phase 01's
`PLAN[A].md`, R2). Nothing merges to `main` while this stack is open. The commands below
run on merge day, once this PR (and everything below it in the stack) is on `main`.

## 1. Apply the protection payload

```
gh api -X PUT repos/ShevinuM/spidey-hub/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": [] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "require_code_owner_reviews": false,
    "dismiss_stale_reviews": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
```

Every field is load-bearing. None of these are defaults to leave alone:

- **`contexts: []`, not `null`.** With `null` the incremental
  `POST .../protection/required_status_checks/contexts` calls used in step 3 below 404,
  and every future addition means re-PUTting this entire payload instead of adding one
  context at a time.
- **`strict: false`.** `true` means "the branch must be up to date with `main` before it
  can merge" — on a repo with a 15-30 minute gate, every merge would invalidate every
  other open PR's status checks and force a full re-run. `false` lets independent PRs
  merge without babysitting each other.
- **`enforce_admins: true`.** This is the only setting that actually stops the repo owner
  from pushing straight to `main`. With `false`, every rule below is advisory for the
  owner and binding for no one, since this is a solo repo — there are no other admins to
  bind.
- **`required_approving_review_count: 0` and `require_code_owner_reviews: false`.**
  GitHub will not let a PR author approve their own pull request. On a solo repo, any
  non-zero approval count deadlocks every future merge permanently. Including the
  `required_pull_request_reviews` object at all is what turns on "require a pull request
  before merging" in the first place — the `0` inside it just means no approval is
  required to satisfy that requirement. `require_code_owner_reviews: false` for the same
  reason: `.github/CODEOWNERS` routes review requests, it does not gate merges.
- **`required_linear_history: true`.** Blocks merge commits. `main` has zero merge
  commits today (see R5 in phase 01's `PLAN[A].md` — every PR here is rebase-merged); this
  keeps it that way.
- **`allow_force_pushes: false`, `allow_deletions: false`.** Baseline protection against
  destroying `main`'s history or the branch itself.
- **`required_conversation_resolution: true`.** Review comments must be resolved before
  merge.

## 2. Match the repo's merge settings to the linear-history rule

`required_linear_history: true` blocks merge commits, so the repo's own merge-button
settings need to agree with it:

```
gh api -X PATCH repos/ShevinuM/spidey-hub \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=true \
  -F allow_squash_merge=true \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true
```

`allow_auto_merge=true` is the highest-value flag here given a 15-30 minute gate — it
lets `gh pr merge --auto --rebase --delete-branch <n>` queue a merge to fire when checks
go green, instead of someone babysitting the run. `allow_squash_merge` stays on as a
deliberate exception (some PRs are legitimately squashed), never the default — rebase is.

## 3. Register required contexts, one at a time, only after each lands on `main`

```
gh api -X POST repos/ShevinuM/spidey-hub/branches/main/protection/required_status_checks/contexts \
  -f "contexts[]=<exact check-run name>"
```

**The invariant (R2): a check becomes required only after the workflow producing it is
merged to `main` — never the reverse.** A context that is required but never produced
sits at "Expected — waiting for status" forever, and with `enforce_admins: true` that is
a hard lock with no bypass short of disabling protection. Register contexts one at a time
as each PR in the stack lands, not all at once tonight.

### The check-run names verified live, and how they were verified

These are the exact strings observed on live PRs against this stack (`PLAN[A].md` R38),
**not** derived from a workflow's `name:` field by inspection — GitHub's actual naming
behavior for matrix jobs surprised the phase once already (see the R38 gotcha below), so
these were confirmed against `gh pr checks` on a real PR, not assumed from the YAML.

```
gate
coverage
CodeQL (javascript-typescript, none)
CodeQL (actions, none)
```

- `gate` and `coverage` — the two jobs in `.github/workflows/ci.yml`, each given an
  explicit `name:` for exactly this reason (R2).
- `CodeQL (javascript-typescript, none)` and `CodeQL (actions, none)` — the two matrix
  entries in `.github/workflows/codeql.yml`. **The `, none` is not decorative.** R38
  (correcting an earlier ruling, R37, that assumed otherwise): GitHub appends _every_ key
  in a matrix `include` entry to the check-run name, not only the key that varies between
  entries. Both entries share `build-mode: none`, and GitHub appends it to both names
  anyway. Registering `CodeQL (javascript-typescript)` — the name you'd guess from reading
  the matrix — matches nothing that is ever produced, and per the invariant above that
  blocks every merge forever under `enforce_admins: true`.
- CodeQL also emits a **third, separate check run literally named `CodeQL`** — an
  aggregate GitHub adds on its own alongside the two matrix jobs. It is not one of this
  repo's own checks and requiring it does not substitute for requiring the two matrix
  checks above. Do not register it.

### Do NOT register these — informational only (R36)

```
Codacy Static Code Analysis
Codacy Diff Coverage
Codacy Coverage Variation
```

Codacy owns exactly three signals in this stack (diff coverage, cyclomatic complexity,
grade trend) and all three stay informational, not required. `Codacy Diff Coverage` in
particular reported green on its first real PR for the wrong reason: the check computes
diff coverage against the pull request's common ancestor, and that ancestor predated the
coverage job entirely — `coverableLines: 0`, `coveredLines: 0`, cause `NoCoverableLines`.
It was green because there was nothing to diff, not because a number was computed and
cleared a bar. That is a false green, not evidence the check works. Issue #4's plan to
hold Codacy informational "until 3-5 PRs establish the noise level" is not caution for
caution's sake — the first data point already needed to be disqualified.

### The rule that outlives this document

**Read the live names off `gh pr checks` on merge day and register those — never retype
them from any document, including this one.** A job can be renamed between when this was
written and when it merges, silently making a required context stop being satisfied by
anything, or a context can be mistyped once and block every merge invisibly until someone
tries to merge and wonders why it never goes green.

## 4. Verify by reading the configuration back

```
gh api repos/ShevinuM/spidey-hub/branches/main/protection
```

Confirm at minimum: `enforce_admins.enabled: true`,
`required_pull_request_reviews.required_approving_review_count: 0`,
`required_linear_history.enabled: true`, and that `required_status_checks.contexts`
lists every context registered so far in step 3.

## Escape hatch — CI outage only

If a genuine CI outage blocks every merge and there is no way to get a check green,
`enforce_admins` can be dropped temporarily to bypass protection for the owner:

```
gh api -X DELETE repos/ShevinuM/spidey-hub/branches/main/protection/enforce_admins
# ... merge what's needed ...
gh api -X POST repos/ShevinuM/spidey-hub/branches/main/protection/enforce_admins
```

Never delete the protection object itself (`DELETE .../branches/main/protection`) to work
around a stuck check — that removes every rule above, not just the one causing trouble.
