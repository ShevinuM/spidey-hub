// Unit test for the pure mapper in src/lib/githubCommits.ts: client-side
// commit refresh must map to the same shape as the
// build-time snapshot generator, scripts/generate.mjs's fetchCommits().
// The fetch/sessionStorage side of that module is exercised end-to-end by
// tests/e2e/repositories.spec.ts (route-fulfill / route-abort against a live
// page), not here — this only pins the shape-mapping logic itself.
import { expect, test } from "vitest";
import { mapGithubCommits } from "../../src/lib/githubCommits.ts";

test("maps a GitHub commits API response to {sha8, msg, html_url, initials}", () => {
  const api = [
    {
      sha: "ab88cac7eb2fba7cccc6915055a5983c4a6b77f4",
      commit: { message: "Add transcript-tts MCP server\n\nLonger body text.", author: { name: "Shevinu M" } },
      author: { login: "ShevinuM" },
      html_url: "https://github.com/ShevinuM/transcript-tts/commit/ab88cac7eb2fba7cccc6915055a5983c4a6b77f4",
    },
  ];
  expect(mapGithubCommits(api)).toEqual([
    {
      sha: "ab88cac7eb2fba7cccc6915055a5983c4a6b77f4",
      sha8: "ab88cac7",
      msg: "Add transcript-tts MCP server",
      html_url: "https://github.com/ShevinuM/transcript-tts/commit/ab88cac7eb2fba7cccc6915055a5983c4a6b77f4",
      initials: "Sh",
    },
  ]);
});

test("falls back to commit.author.name when the GitHub `author` (login) is null", () => {
  const api = [
    {
      sha: "deadbeef00",
      commit: { message: "solo line", author: { name: "jane" } },
      author: null,
      html_url: "https://github.com/ShevinuM/x/commit/deadbeef00",
    },
  ];
  expect(mapGithubCommits(api)[0].initials).toBe("Ja");
});

test("a commit missing `sha` maps to sha: undefined (never an empty string)", () => {
  const api = [
    {
      commit: { message: "no sha on this one", author: { name: "jane" } },
      author: null,
      html_url: "https://github.com/ShevinuM/x/commit/unknown",
    },
  ];
  expect(mapGithubCommits(api)[0].sha).toBe(undefined);
  expect(mapGithubCommits(api)[0].sha8).toBe("");
});

test("non-array input returns an empty list instead of throwing", () => {
  expect(mapGithubCommits({ message: "Bad credentials" })).toEqual([]);
  expect(mapGithubCommits(null)).toEqual([]);
  expect(mapGithubCommits(undefined)).toEqual([]);
});
