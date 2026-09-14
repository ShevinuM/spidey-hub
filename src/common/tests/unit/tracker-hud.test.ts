// Guards tracker.yaml's HUD box: every hud.left line must stay the same code-point width the hand re-padded header relies on.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const ROOT = join(import.meta.dirname, "../../../..");

interface TrackerYaml {
  hud: { left: string[]; right: string[] };
}

function realTracker(): TrackerYaml {
  return YAML.parse(readFileSync(join(ROOT, "src/common/content/tracker.yaml"), "utf8")) as TrackerYaml;
}

test("every hud.left line is exactly 37 code points wide (box alignment survives the retina-v rename)", () => {
  const { hud } = realTracker();
  const widths = hud.left.map((line) => [...line].length);
  expect(widths).toEqual(hud.left.map(() => 37));
});

test("the header names retina-v, not spider-tracker, and the closing edge is untouched box-drawing", () => {
  const { hud } = realTracker();
  const header = hud.left[0];
  const footer = hud.left[hud.left.length - 1];
  expect(header).toMatch(/^┌─ retina-v ─+┐$/);
  expect(header).not.toMatch(/spider-tracker/);
  expect(footer).toMatch(/^└─+┘$/);
});
