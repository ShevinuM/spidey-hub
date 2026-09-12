// Unit tests for src/common/lib/ago-label.ts — a pure, zero-import
// "42s"/"6m"/"1h"/"3d" formatter with two real consumers,
// src/features/notifications/components/notificationsState.svelte.ts and
// src/features/repositories/components/repositoriesState.svelte.ts, which
// is why it lives in common/lib/ rather than inside either feature.
import { expect, test } from "vitest";
import { agoLabel } from "../../../src/common/lib/ago-label";

test("agoLabel: seconds/minutes/hours/days thresholds", () => {
  const now = 1_000_000_000;
  expect(agoLabel(now - 42_000, now)).toBe("42s");
  expect(agoLabel(now - 6 * 60_000, now)).toBe("6m");
  expect(agoLabel(now - 2 * 3_600_000, now)).toBe("2h");
  expect(agoLabel(now - 3 * 86_400_000, now)).toBe("3d");
});

test("agoLabel: never negative even if ts is momentarily ahead of now", () => {
  expect(agoLabel(1000, 999)).toBe("0s");
});
