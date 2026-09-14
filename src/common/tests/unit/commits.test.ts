// PORTFOLIO_FIXTURES is unset here, so these tests read the real src/generated/commits/*.json snapshots, not the fixture table.
import { expect, test } from "vitest";
import { getCommits, getCommitsByRepo } from "../../lib/commits";

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
