import { defineConfig } from "vitest/config";

// Scoped to tests/unit only (toolchain R004: Vitest runs pure lib/engine
// modules, no DOM/browser) — Playwright's own *.spec.ts files under
// tests/e2e and tests/visual must never be picked up by vitest's default
// include glob.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
