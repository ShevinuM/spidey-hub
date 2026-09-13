import { defineConfig } from "vitest/config";

// Scoped to unit-test trees only (toolchain R004: Vitest runs pure lib/engine
// modules, no DOM/browser) — Playwright's own *.spec.ts files under
// tests/visual and every `tests/ui/`/`common/tests/ui/`/
// `src/features/*/tests/ui/` folder must never be picked up by vitest's
// default include glob. Widened once, in phase 02 (00-phases.md D9), to
// cover the unit-test homes the bounded-context split introduces:
// `common/tests/unit/` (phase 02's own tmux/vim/cmdline/views tests) and
// `src/features/*/tests/unit/` (every later feature phase's own, per
// architecture R001) — in addition to the original bulk-imported
// `tests/unit/`, which stays populated until each feature phase claims its
// own tests out of it.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "common/tests/unit/**/*.test.ts", "src/features/*/tests/unit/**/*.test.ts"],
  },
});
