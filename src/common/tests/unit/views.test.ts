// Locks viewToTmuxBinding() to the live window-number map it's handed, never a fixed view-to-binding table, so a window renumbering after a kill/re-create is reflected without a code change.
import { expect, test } from "vitest";
import { viewToTmuxBinding } from "../../lib/views";

test("viewToTmuxBinding looks up the live window number, never a fixed table", () => {
  const windowNumbers = { dashboard: 0, repositories: 1, employment: 2, "retina-v": 3, profile: 4, help: 5 };
  expect(viewToTmuxBinding("repositories", windowNumbers)).toBe("C-b 1");
  expect(viewToTmuxBinding("help", windowNumbers)).toBe("C-b 5");

  // A window's number moving (e.g. after a kill/re-create elsewhere)
  // changes the binding — nothing here is hardcoded by menu position.
  const reshuffled = { ...windowNumbers, help: 9 };
  expect(viewToTmuxBinding("help", reshuffled)).toBe("C-b 9");

  // A view whose window isn't present in the live session has no binding.
  const { help: _help, ...withoutHelp } = windowNumbers;
  expect(viewToTmuxBinding("help", withoutHelp)).toBe(undefined);
});
