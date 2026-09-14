import { defineConfig } from "vitest/config";

// Scoped to unit-test-only trees so vitest's include glob never picks up
// Playwright's *.spec.ts files under tests/visual or any tests/ui/ folder
// (root, src/common/tests/ui/, src/features/*/tests/ui/).
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
