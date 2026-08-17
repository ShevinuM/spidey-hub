// Unit tests for src/lib/githubTrees.ts (PLAN.md Phase 4 item 5: "unit
// tests for githubTrees.ts (tree mapping, base64 decode incl. multibyte,
// cache TTL, null-on-failure)"). Follows the same style as
// tests/unit/githubCommits.test.ts: pure/cache logic is exercised directly
// here; the live fetch/DOM integration is covered end-to-end by
// tests/e2e/builds.spec.ts's mocked-route tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapTreeResponse,
  decodeBase64Utf8,
  fetchCommitTree,
  fetchCommitFileContent,
  getCachedTree,
  setCachedTree,
  treeCacheKey,
  contentCacheKey,
} from "../../src/lib/githubTrees.ts";

test("mapTreeResponse keeps only blob entries and their paths", () => {
  const api = {
    sha: "abc123",
    tree: [
      { path: "src", mode: "040000", type: "tree", sha: "aaa" },
      { path: "src/index.ts", mode: "100644", type: "blob", sha: "bbb" },
      { path: "README.md", mode: "100644", type: "blob", sha: "ccc" },
    ],
    truncated: false,
  };
  assert.deepEqual(mapTreeResponse(api), ["src/index.ts", "README.md"]);
});

test("mapTreeResponse returns null for an unrecognizable shape", () => {
  assert.equal(mapTreeResponse({ message: "Not Found" }), null);
  assert.equal(mapTreeResponse(null), null);
  assert.equal(mapTreeResponse(undefined), null);
  assert.equal(mapTreeResponse([]), null);
});

test("decodeBase64Utf8 round-trips multibyte UTF-8 (accents, CJK, emoji)", () => {
  const original = "héllo wörld — 日本語のテキスト 🎉";
  const b64 = Buffer.from(original, "utf8").toString("base64");
  assert.equal(decodeBase64Utf8(b64), original);
});

test("decodeBase64Utf8 handles GitHub's newline-wrapped base64 payloads", () => {
  const original = "line one\nline two\nline three";
  const b64 = Buffer.from(original, "utf8").toString("base64");
  // GitHub's Contents API wraps base64 content at 60 chars with embedded
  // newlines — decodeBase64Utf8 must strip those before atob(), not treat
  // them as part of the payload.
  const wrapped = b64.replace(/(.{10})/g, "$1\n");
  assert.equal(decodeBase64Utf8(wrapped), original);
});

test("tree cache: a fresh entry is returned, an expired one is treated as a miss", () => {
  sessionStorage.clear();
  setCachedTree("transcript-tts", "deadbeef", ["a.py", "b.py"]);
  assert.deepEqual(getCachedTree("transcript-tts", "deadbeef"), ["a.py", "b.py"]);

  // Manually backdate the cache entry past the 10min TTL and confirm the
  // read now misses (same mechanism githubCommits.ts's own cache uses).
  const key = treeCacheKey("transcript-tts", "deadbeef");
  const raw = sessionStorage.getItem(key);
  assert.ok(raw);
  const entry = JSON.parse(raw);
  entry.ts = Date.now() - 11 * 60 * 1000;
  sessionStorage.setItem(key, JSON.stringify(entry));
  assert.equal(getCachedTree("transcript-tts", "deadbeef"), null);
});

test("contentCacheKey and treeCacheKey are distinct per repo/ref/path", () => {
  assert.notEqual(treeCacheKey("a", "sha1"), treeCacheKey("b", "sha1"));
  assert.notEqual(contentCacheKey("a", "sha1", "x.py"), contentCacheKey("a", "sha1", "y.py"));
  assert.notEqual(contentCacheKey("a", "sha1", "x.py"), contentCacheKey("a", "sha2", "x.py"));
});

test("fetchCommitTree returns null when every candidate ref is rejected (never throws)", async () => {
  sessionStorage.clear();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
  try {
    const result = await fetchCommitTree("nonexistent-repo", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "deadbeef");
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchCommitTree returns null on a network error (rejected fetch)", async () => {
  sessionStorage.clear();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
  try {
    const result = await fetchCommitTree("transcript-tts", undefined, "deadbeef");
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchCommitTree falls back from a full sha to sha8 when the full sha is rejected", async () => {
  sessionStorage.clear();
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (url: string) => {
    requested.push(url);
    if (url.includes("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")) {
      return { ok: false, status: 422 };
    }
    return {
      ok: true,
      json: async () => ({ sha: "deadbeef", tree: [{ path: "README.md", type: "blob" }], truncated: false }),
    };
  }) as unknown as typeof fetch;
  try {
    const result = await fetchCommitTree("transcript-tts", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "deadbeef");
    assert.deepEqual(result, ["README.md"]);
    assert.equal(requested.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchCommitFileContent returns {kind:'binary'} for an oversized file", async () => {
  sessionStorage.clear();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ size: 500_000, encoding: "base64", content: "" }),
  })) as unknown as typeof fetch;
  try {
    const result = await fetchCommitFileContent("transcript-tts", "big.bin", undefined, "deadbeef");
    assert.deepEqual(result, { kind: "binary" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchCommitFileContent returns null on a 403 (rate limit), never throws", async () => {
  sessionStorage.clear();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: false, status: 403 })) as unknown as typeof fetch;
  try {
    const result = await fetchCommitFileContent("transcript-tts", "README.md", "deadbeef", "deadbeef");
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchCommitFileContent decodes a real base64 text payload into lines", async () => {
  sessionStorage.clear();
  const originalFetch = globalThis.fetch;
  const text = "# héllo\nsecond line";
  const b64 = Buffer.from(text, "utf8").toString("base64");
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ size: text.length, encoding: "base64", content: b64 }),
  })) as unknown as typeof fetch;
  try {
    const result = await fetchCommitFileContent("transcript-tts", "README.md", "deadbeef", "deadbeef");
    assert.deepEqual(result, { kind: "text", lines: ["# héllo", "second line"] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
