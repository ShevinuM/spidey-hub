import { defineConfig } from "vitest/config";

// Scoped to unit-test-only trees so vitest's include glob never picks up
// Playwright's *.spec.ts files under any tests/ui/ folder (root,
// src/common/tests/ui/, src/features/*/tests/ui/).
export default defineConfig({
  test: {
    include: [
      "scripts/tests/unit/**/*.test.ts",
      "tests/audits/**/*.test.ts",
      "src/common/tests/unit/**/*.test.ts",
      "src/features/*/tests/unit/**/*.test.ts",
    ],
    // Scoped to the plain-TypeScript surface unit tests actually exercise.
    // Svelte components are covered by Playwright and emit no V8
    // instrumentation, so letting this include glob run unscoped would
    // report a near-zero percentage that misrepresents the repo.
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/common/lib/**/*.ts",
        "src/common/engines/**/*.ts",
        "src/features/*/lib/**/*.ts",
        "scripts/lib/**/*.ts",
      ],
      exclude: ["**/tests/**", "src/generated/**"],
    },
  },
});
