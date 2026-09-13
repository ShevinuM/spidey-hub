// Unit-pins tree mapping, base64 decode, cache TTL, and null-on-failure logic; the live fetch/DOM integration is covered by repositories.spec.ts's mocked-route tests.
import { expect, test } from "vitest";
import {
  mapTreeResponse,
  decodeBase64Utf8,
  fetchCommitTree,
  fetchCommitFileContent,
  getCachedTree,
  setCachedTree,
  treeCacheKey,
  contentCacheKey,
} from "../../lib/github-trees";

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
  expect(mapTreeResponse(api)).toEqual(["src/index.ts", "README.md"]);
});

test("mapTreeResponse returns null for an unrecognizable shape", () => {
  expect(mapTreeResponse({ message: "Not Found" })).toBe(null);
  expect(mapTreeResponse(null)).toBe(null);
  expect(mapTreeResponse(undefined)).toBe(null);
  expect(mapTreeResponse([])).toBe(null);
});

test("decodeBase64Utf8 round-trips multibyte UTF-8 (accents, CJK, emoji)", () => {
  const original = "héllo wörld — 日本語のテキスト 🎉";
  const b64 = Buffer.from(original, "utf8").toString("base64");
  expect(decodeBase64Utf8(b64)).toBe(original);
});

test("decodeBase64Utf8 handles GitHub's newline-wrapped base64 payloads", () => {
  const original = "line one\nline two\nline three";
  const b64 = Buffer.from(original, "utf8").toString("base64");
  // GitHub's Contents API wraps base64 content at 60 chars with embedded
  // newlines — decodeBase64Utf8 must strip those before atob(), not treat
  // them as part of the payload.
  const wrapped = b64.replace(/(.{10})/g, "$1\n");
  expect(decodeBase64Utf8(wrapped)).toBe(original);
});

test("tree cache: a fresh entry is returned, an expired one is treated as a miss", () => {
  sessionStorage.clear();
  setCachedTree("transcript-tts", "deadbeef", ["a.py", "b.py"]);
  expect(getCachedTree("transcript-tts", "deadbeef")).toEqual(["a.py", "b.py"]);

  // Manually backdate the cache entry past the 10min TTL and confirm the
  // read now misses (same mechanism github-commits.ts's own cache uses).
  const key = treeCacheKey("transcript-tts", "deadbeef");
  const raw = sessionStorage.getItem(key);
  expect(raw).toBeTruthy();
  const entry = JSON.parse(raw!);
  entry.ts = Date.now() - 11 * 60 * 1000;
  sessionStorage.setItem(key, JSON.stringify(entry));
  expect(getCachedTree("transcript-tts", "deadbeef")).toBe(null);
});

test("contentCacheKey and treeCacheKey are distinct per repo/ref/path", () => {
  expect(treeCacheKey("a", "sha1")).not.toBe(treeCacheKey("b", "sha1"));
  expect(contentCacheKey("a", "sha1", "x.py")).not.toBe(contentCacheKey("a", "sha1", "y.py"));
  expect(contentCacheKey("a", "sha1", "x.py")).not.toBe(contentCacheKey("a", "sha2", "x.py"));
});

test("fetchCommitTree returns null when every candidate ref is rejected (never throws)", async () => {
  sessionStorage.clear();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
  try {
    const result = await fetchCommitTree("nonexistent-repo", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "deadbeef");
    expect(result).toBe(null);
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
    expect(result).toBe(null);
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
    expect(result).toEqual(["README.md"]);
    expect(requested.length).toBe(2);
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
    expect(result).toEqual({ kind: "binary" });
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
    expect(result).toBe(null);
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
    expect(result).toEqual({ kind: "text", lines: ["# héllo", "second line"] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
