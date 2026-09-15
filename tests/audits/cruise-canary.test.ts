// A canary for the second half of `pnpm architecture`.
//
// dependency-cruiser parses a `.svelte` file by handing it to THIS PROJECT's
// own `svelte/compiler` and reading the imports back out of the compiled JS. If
// that compiler is ever not resolvable — a dependency bump, a pruned install, a
// hoisting change — the tool does not fail. `.svelte` simply stops being an
// enabled extension, every SFC drops out of the graph, and the cruise reports
// "no dependency violations found" and exits 0. Measured here by renaming
// `node_modules/svelte`: the graph fell from 104 modules / 185 dependencies to
// 68 / 98, all 36 `.svelte` files gone, still green. Nothing else in the repo
// would notice, which is why this test exists.
//
// This is deliberately NOT a boundary rule: it claims nothing about what may
// import what. It only claims the parser still sees.
//
// Two details are load-bearing and must not be "simplified":
//   - It cruises a DIRECTORY, the way the `architecture` script does. Naming an
//     SFC directly as an entry point makes the tool parse it even when `.svelte`
//     is disabled (it falls back to the TypeScript path and yields a plausible
//     dependency list), so a file-entry canary passes with `svelte` deleted.
//     Verified: that form returned 22 dependencies with the compiler removed.
//   - The subject imports components used ONLY in template markup, never in
//     `<script>`. That is the shape that regressed in the tool's own issue
//     #1045 and this repo's dominant pattern; a type-stripping pre-pass deletes
//     exactly those edges while leaving script-block imports intact.
import { expect, test } from "vitest";
import { cruise } from "dependency-cruiser";
import extractDepcruiseConfig from "dependency-cruiser/config-utl/extract-depcruise-config";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const CONFIG = join(ROOT, ".dependency-cruiser.mjs");

/** Cruised as a directory, not as a file — see the note above. */
const SUBJECT_DIRECTORY = "src/bootstrap";

/** Imports ~18 modules, all of them referenced from template markup only. */
const SUBJECT = "src/bootstrap/Terminal.svelte";

test("the cruise still parses .svelte files instead of silently seeing a graph without them", async () => {
  const config = await extractDepcruiseConfig(CONFIG);
  // `maxDepth: 1` keeps this to the subject's direct dependencies: the whole
  // question is whether the SFC parses, not what the graph beyond it looks like.
  const result = await cruise([SUBJECT_DIRECTORY], { ...config.options, maxDepth: 1, ruleSet: config });
  if (typeof result.output === "string") throw new Error("expected a cruise result object, got a report string");

  const subject = result.output.modules.find((module) => module.source === SUBJECT);
  expect(
    subject,
    `${SUBJECT} is absent from the cruise output. That is what a missing .svelte parser looks like — the cruise still exits 0. Check that \`pnpm exec depcruise --info\` prints a resolved \`svelte/compiler\` and a ticked \`.svelte\`.`,
  ).toBeDefined();

  const dependencies = subject?.dependencies ?? [];
  expect(dependencies.length, `${SUBJECT} resolved to zero dependencies`).toBeGreaterThan(0);

  // The markup-only `.svelte` -> `.svelte` edge specifically.
  expect(
    dependencies.filter((dependency) => dependency.resolved.endsWith(".svelte")).length,
    `${SUBJECT} resolved no .svelte dependencies. Its component imports are used only in template markup, so this is the edge class that goes dark first.`,
  ).toBeGreaterThan(0);
});
