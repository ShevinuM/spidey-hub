# Visual testing

What belongs in the visual suite, and the golden-image discipline that keeps it trustworthy. Playwright-tool mechanics live in `../tech-stack/playwright.md`; general test-code placement lives in `README.md`.

## What belongs here

- [ ] **R001** A visual recipe proves rendered appearance stays correct — layout, overflow, an adversarial fixture rendering without clipping — never flow. A recipe that clicks through a multi-step user journey just to reach one screenshot is doing `e2e-testing.md`'s job in the wrong suite.
- [ ] **R002** A visual recipe navigates to the state it needs directly (a fixture-seeded URL/prop), not by re-driving a multi-step flow — the e2e suite is where flows are proven; re-driving one here just to reach a screenshot defeats the reason this suite exists to be cheap.

## Coverage & fixtures

- [ ] **R003** The visual suite covers every page/state a feature can render, driven by that feature's own fixture data living inside its `tests/ui/visual/` (or `content/fixtures/`) folder — never a shared top-level fixture dump one feature's change can silently affect another's goldens through.
- [ ] **R004** Fixture data includes deliberately adversarial cases (an overflowing record, an unbroken long line, an empty collection) so clipping, non-scrollable bodies, and empty states can't hide behind a small, always-comfortable fixture set.

## Golden-image discipline

- [ ] **R005** Visual goldens are self-baselines, not a fixed external target: never rebaseline a golden to make a pure refactor's diff pass — a diff on a change advertised as "no behavior change" is a regression to fix, not a snapshot to update. Rebaseline only in the same change as a deliberate visual change, followed by several consecutive clean runs and a manual inspection of every changed image (not just the byte diff).
- [ ] **R006** Never hand-edit a golden image file.
- [ ] **R007** Keep a golden deterministic at the source, not by tolerance: seed fixtures instead of reading live content, disable/freeze animations at capture time, and mask any genuinely non-deterministic content (a live measurement, a timestamp, a random pick) rather than letting it drift the pixels and loosening the comparison threshold to compensate.
