import { expect, test } from "vitest";
import { FADE_BOTTOM_STYLE } from "../../lib/fade-mask";

const GRADIENT = "linear-gradient(180deg,#000 calc(100% - 16px),transparent)";

function declarations(style: string): [string, string][] {
  return style.split(";").map((decl) => {
    const colon = decl.indexOf(":");
    return [decl.slice(0, colon), decl.slice(colon + 1)];
  });
}

test("FADE_BOTTOM_STYLE declares mask-image and -webkit-mask-image, in that order", () => {
  expect(declarations(FADE_BOTTOM_STYLE).map(([prop]) => prop)).toEqual([
    "mask-image",
    "-webkit-mask-image",
  ]);
});

test("FADE_BOTTOM_STYLE gives both declarations the same 16px bottom fade", () => {
  for (const [, value] of declarations(FADE_BOTTOM_STYLE)) expect(value).toBe(GRADIENT);
});

test("FADE_BOTTOM_STYLE has no leading or trailing semicolon", () => {
  expect(FADE_BOTTOM_STYLE.startsWith(";")).toBe(false);
  expect(FADE_BOTTOM_STYLE.endsWith(";")).toBe(false);
});
