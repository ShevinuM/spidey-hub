import { defineConfig } from "vitest/config";

// Scoped to unit-test trees only (toolchain R004: Vitest runs pure lib/engine
// modules, no DOM/browser) — Playwright's own *.spec.ts files under
// tests/visual and every `tests/ui/`/`src/common/tests/ui/`/
// `src/features/*/tests/ui/` folder must never be picked up by vitest's
// default include glob. Widened once, in phase 02 (00-phases.md D9), to
// cover the unit-test homes the bounded-context split introduces:
// `src/common/tests/unit/` (phase 02's own tmux/vim/cmdline/views tests) and
// `src/features/*/tests/unit/` (every later feature phase's own, per
// architecture R001). Phase 13's tests restructure retired the original
// bulk-imported `tests/unit/` once its last two files claimed their own
// homes: `scripts/tests/unit/` for build-time tooling tests, beside the
// tooling, and `tests/audits/` for repo-wide source-hygiene scans.
export default defineConfig({
  test: {
    include: [
      "scripts/tests/unit/**/*.test.ts",
      "tests/audits/**/*.test.ts",
      "src/common/tests/unit/**/*.test.ts",
      "src/features/*/tests/unit/**/*.test.ts",
    ],
  },
});
