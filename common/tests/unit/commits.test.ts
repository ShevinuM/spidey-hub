// Unit tests for src/common/lib/commits.ts — a build-time commit-snapshot
// loader that lives in common/lib/ because it has real consumers outside
// any one feature (six route pages' frontmatter, plus type-only imports
// elsewhere). These two tests exercise the module's real (non-fixture) glob
// against the checked-in src/generated/commits/*.json snapshots —
// PORTFOLIO_FIXTURES is unset in the unit-test environment, so
// getCommits()/getCommitsByRepo() read the REAL table, not the fixture one.
import { expect, test } from "vitest";
import { getCommits, getCommitsByRepo } from "../../../src/common/lib/commits";

test("getCommits: a repo name with no snapshot yields [], not a throw", () => {
  expect(getCommits("this-repo-name-has-no-snapshot-file")).toEqual([]);
});

test("getCommitsByRepo: a repo name repeated across projects is only looked up once and appears once", () => {
  const repeated = "daily-tech-digest";
  const projects = [
    { data: { repos: [{ name: repeated }] } },
    { data: { repos: [{ name: repeated }] } },
  ];

  const result = getCommitsByRepo(projects);

  expect(Object.keys(result)).toEqual([repeated]);
  expect(result[repeated]).toEqual(getCommits(repeated));
});
