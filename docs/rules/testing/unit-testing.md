# Unit testing

What belongs in the unit suite and what earns a file/test within it. Cross-suite rules (where test code lives, fix-the-implementation-not-the-test, root audits) live in `README.md` — not repeated here.

- [ ] **R001** Unit tests cover pure, DOM-free logic only: `common/engines/`, `common/lib/`, and each feature's own `lib/*.ts` and state-class methods. If what's being asserted needs a real browser or rendered DOM, it belongs in `../e2e-testing.md` or `../visual-testing.md` instead — writing it here as a jsdom workaround defeats the reason this suite stays fast.
- [ ] **R002** Test pressure follows the architecture: `common/engines/` and `common/lib/`/a feature's `lib/` (pure, no DOM) get the richest coverage — cheapest to test, costliest to get wrong. Orchestrator components and bootstrap wiring get thinner unit coverage and rely on e2e/visual for their real assurance.
- [ ] **R003** A file earns a test file when it owns a runtime branch or invariant of its own — not because "every file has a sibling test" is the target. A type-only file or a pure passthrough is proven by the type checker, not a spec.
- [ ] **R004** The unit under test is a behavior, not a file or a method — a state class is specified through its public methods (state in → method call → observable state out), organized by behavior cluster, not one test per getter.
