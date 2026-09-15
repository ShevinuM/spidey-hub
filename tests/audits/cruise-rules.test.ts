// Proof that the two rules in `.dependency-cruiser.mjs` still fire.
//
// The repo holds no cycles and no transitive feature-to-feature reaches, so the
// real cruise reports zero violations — which is the number a rule matching
// nothing would report just as well. Each test below plants the violation one
// rule exists to catch, in a throwaway directory, and asserts that rule reports
// it by name.
//
// `baseDir` is what makes a directory outside the repo legible to the shipped
// rules: every module in the output is named relative to it, so a fixture
// rooted at `<scratch>/src/features/alpha` is reported as
// `src/features/alpha/…` and meets the rules' `^src/` anchors. The fixtures are
// written and removed inside each test and `src/` is never involved.
//
// Every test asserts its planted edges resolved BEFORE asserting the violation.
// A specifier that resolves to nothing yields no edge, and a cruise over a
// graph with no edges is clean — which reads exactly like a rule that has
// stopped firing.
import { expect, test } from "vitest";
import { cruise } from "dependency-cruiser";
import type { ICruiseResult } from "dependency-cruiser";
import extractDepcruiseConfig from "dependency-cruiser/config-utl/extract-depcruise-config";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG = join(import.meta.dirname, "../../.dependency-cruiser.mjs");

/** Cruises `files` — keyed by repo-relative path — under the shipped config. */
async function cruiseFixture(files: Record<string, string>): Promise<ICruiseResult> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "spidey-cruise-rules-")));
  try {
    for (const [path, source] of Object.entries(files)) {
      const absolute = join(directory, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, source);
    }

    const config = await extractDepcruiseConfig(CONFIG);
    const result = await cruise(["src"], {
      ...config.options,
      baseDir: directory,
      // The `depcruise` binary sets this; the API leaves it off, and without it
      // the graph is built but no rule is scored against it.
      validate: true,
      ruleSet: config,
    });
    if (typeof result.output === "string")
      throw new Error("expected a cruise result object, got a report string");
    return result.output;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectResolvedEdge(output: ICruiseResult, from: string, to: string): void {
  const module = output.modules.find((candidate) => candidate.source === from);
  expect(module, `${from} is absent from the cruise output, so nothing was planted`).toBeDefined();

  const dependency = module?.dependencies.find((candidate) => candidate.resolved === to);
  expect(
    dependency,
    `${from} has no edge to ${to}: the planted import resolved to nothing`,
  ).toBeDefined();
  expect(dependency?.couldNotResolve, `${from} -> ${to} did not resolve`).toBe(false);
}

function firedRules(output: ICruiseResult): string[] {
  return [...new Set(output.summary.violations.map((violation) => violation.rule.name))].sort();
}

test("no-circular reports a dependency cycle", async () => {
  const output = await cruiseFixture({
    "src/features/alpha/index.ts":
      'import { helper } from "./helper";\nexport const alpha = helper;\n',
    "src/features/alpha/helper.ts":
      'import { alpha } from "./index";\nexport const helper = alpha;\n',
  });

  expectResolvedEdge(output, "src/features/alpha/index.ts", "src/features/alpha/helper.ts");
  expectResolvedEdge(output, "src/features/alpha/helper.ts", "src/features/alpha/index.ts");

  expect(firedRules(output)).toEqual(["no-circular"]);
});

test("no-transitive-peer-feature reports a feature reaching a peer through common/", async () => {
  const output = await cruiseFixture({
    "src/features/alpha/index.ts":
      'import { bridge } from "../../common/bridge";\nexport const alpha = bridge;\n',
    "src/common/bridge.ts":
      'import { beta } from "../features/beta/index";\nexport const bridge = beta;\n',
    "src/features/beta/index.ts": "export const beta = 1;\n",
  });

  expectResolvedEdge(output, "src/features/alpha/index.ts", "src/common/bridge.ts");
  expectResolvedEdge(output, "src/common/bridge.ts", "src/features/beta/index.ts");

  expect(firedRules(output)).toEqual(["no-transitive-peer-feature"]);

  // Nothing imports beta from alpha directly, so the intermediary in `via` is
  // what distinguishes this from a rule that only scores direct edges.
  const [violation] = output.summary.violations;
  expect(violation.from).toBe("src/features/alpha/index.ts");
  expect(violation.to).toBe("src/features/beta/index.ts");
  expect(violation.via?.map((hop) => hop.name)).toContain("src/common/bridge.ts");
});
