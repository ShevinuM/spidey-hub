// Unit tests for the seeded toast picker (src/lib/notifications.ts, PLAN.md
// Iteration 3 Phase 2 item 2.4 / Locked decision #12). Pure math + string
// parsing only — no sessionStorage/DOM involved, so this covers
// pickToastPair's determinism/distinctness/reachability and
// parseToastSeed's parsing rules directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseToastSeed, pickToastPair, TOAST_SEED_STORAGE_KEY } from "../../src/lib/notifications.ts";

const POOL = Array.from({ length: 54 }, (_, i) => `entry-${i}`);

// ---------------------------------------------------------------------------
// pickToastPair
// ---------------------------------------------------------------------------

test("pickToastPair: same seed always yields the same ordered pair", () => {
  const a = pickToastPair(POOL, 12345);
  const b = pickToastPair(POOL, 12345);
  assert.deepEqual(a, b);
});

test("pickToastPair: the pair is always 2 distinct entries", () => {
  for (let seed = 0; seed < 500; seed++) {
    const [first, second] = pickToastPair(POOL, seed);
    assert.notEqual(first, second, `seed ${seed} produced a duplicate pair`);
  }
});

test("pickToastPair: different seeds reach different pairs", () => {
  const pairs = new Set<string>();
  for (let seed = 0; seed < 30; seed++) {
    const [first, second] = pickToastPair(POOL, seed);
    pairs.add(`${first}|${second}`);
  }
  // 30 seeds against a 54-entry pool should not all collapse onto one pair —
  // require at least a handful of distinct pairs (loose bound: guards
  // against a broken PRNG that always returns the same value, not a strict
  // uniformity claim).
  assert.ok(pairs.size > 5, `expected several distinct pairs across 30 seeds, got ${pairs.size}`);
});

test("pickToastPair: every pool entry is reachable across enough seeds", () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 2000; seed++) {
    const [first, second] = pickToastPair(POOL, seed);
    seen.add(first);
    seen.add(second);
  }
  assert.equal(seen.size, POOL.length, "expected every pool entry to appear across 2000 seeds");
});

test("pickToastPair: throws on a pool smaller than 2 entries", () => {
  assert.throws(() => pickToastPair(["only-one"], 1));
  assert.throws(() => pickToastPair([], 1));
});

// ---------------------------------------------------------------------------
// parseToastSeed
// ---------------------------------------------------------------------------

test("parseToastSeed: parses a plain numeric string", () => {
  assert.equal(parseToastSeed("424242"), 424242);
});

test("parseToastSeed: returns null for missing/empty/unparseable input", () => {
  assert.equal(parseToastSeed(null), null);
  assert.equal(parseToastSeed(undefined), null);
  assert.equal(parseToastSeed(""), null);
  assert.equal(parseToastSeed("not-a-number"), null);
});

test("parseToastSeed: coerces to a uint32 (matches mulberry32's expectations)", () => {
  const parsed = parseToastSeed("-1");
  assert.equal(parsed, (-1) >>> 0);
  assert.ok(Number.isInteger(parsed));
  assert.ok((parsed as number) >= 0);
});

test("TOAST_SEED_STORAGE_KEY is the expected sessionStorage key", () => {
  assert.equal(TOAST_SEED_STORAGE_KEY, "edith:toast-seed");
});
