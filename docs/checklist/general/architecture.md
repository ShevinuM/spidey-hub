# Architecture & layering

The structural rules for the bounded-context rewrite: the skeleton, the dependency rule, shared code, and how feature boundaries are drawn.

## The skeleton

- [ ] **R001** Top level is organized by architectural role:

  ```
  <repo root>/
  ├── src/
  │   ├── features/           one bounded context per folder
  │   │   └── <feature>/
  │   │       ├── components/
  │   │       ├── lib/
  │   │       ├── content/
  │   │       └── tests/
  │   ├── common/              shared code, split by kind (never a catch-all)
  │   │   ├── engines/         feature-agnostic, swappable machinery (tmux, vim)
  │   │   ├── components/      UI reused by 2+ features or by bootstrap
  │   │   ├── lib/             shared pure utilities
  │   │   ├── content/
  │   │   └── tests/           common's tests + the shared UI test infra
  │   └── bootstrap/           composition root — wires common into features
  ├── scripts/                 build-time tooling — never bundled to the client
  ├── tests/                   cross-feature/meta tests only
  └── reference/               vendored third-party design handoff — a build input, never inside src/
  ```

- [ ] **R002** An opt-in folder (`common/engines/`, a feature's `content/`, etc.) is grown in only when its trigger appears — never scaffolded empty ahead of need.
- [ ] **R003** Deliberate architecture choices (engine boundaries, event-vs-prop wiring, the generated-artifact split) are picked once and applied consistently across every feature, not re-decided per feature.

## The dependency rule

- [ ] **R004** Dependencies point outward from `common/` only: a feature may depend on `common/`; `common/` never depends on a feature; `bootstrap/` depends on both and wires them together. No feature imports another feature — not even indirectly through a bootstrap re-export.
- [ ] **R005** A feature exposes only what `bootstrap` needs to wire it in (its top-level component, its content-collection definition, its registration metadata) — nothing in a feature is reached into directly by another feature.
- [ ] **R006** `common/` splits into exactly three kinds, never blurred: `engines/` (swappable, feature-agnostic machinery), `components/` (shared UI consumed by 2+ features or by bootstrap), `lib/` (shared pure utilities with no DOM/runes). A module that doesn't fit one of the three doesn't go in `common/` — it stays in the one feature that owns it until a second consumer proves the need.
- [ ] **R007** An engine in `common/engines/` knows nothing about any specific feature — no hardcoded feature-name unions, no feature-specific branching inside the engine. If an engine needs to know about the concrete set of features, that knowledge is a generic parameter/registry supplied by `bootstrap`, not a constant baked into the engine.
- [ ] **R008** `bootstrap/` is the composition root: it is the only code that imports every feature, wires `common`'s engines into them, and knows the full feature list. A page or entrypoint constructs nothing directly — it calls into `bootstrap`.
- [ ] **R009** Boundary rules (no-feature-imports-feature, no-common-imports-feature, no-feature-imports-bootstrap) are enforced by a fitness test (e.g. dependency-cruiser), not left to convention. A new architecture rule is fired against a synthetic violation once, to prove it isn't passing vacuously, before it's trusted.

## Bounded contexts — drawing and instantiating

- [ ] **R010** Bounded contexts are discovered, not declared: scaffold a feature's folder only when its first real page/use case is being built, and treat early boundaries as provisional until a seam is proven in code.
- [ ] **R011** Boundaries are drawn around language and behavior autonomy, not data relationships. Two features rendering the same underlying content collection doesn't make them one context; two views sharing zero behavior can stay two features even if their data looks similar.
- [ ] **R012** Placement is a spectrum, not a binary: a prop on an existing component → a shared component in `common/` → a full feature folder. A bounded context is expensive (its own tests, its own state class, its own content) — pay for it only when a feature's language and behavior are genuinely its own.
- [ ] **R013** Rule of three: defer promoting a feature's helper into `common/` until a second feature genuinely needs it. A single feature's logic stays inside that feature's own folder.
- [ ] **R014** Cross-feature communication happens through a published surface — a typed signal/event the owning feature exposes via `common/`, or an explicit prop `bootstrap` threads between them — never a direct import of one feature's internals from another. If two features need the same fact, promote it to a shared surface rather than duplicating the reach-in.

## Shared state modelling

- [ ] **R015** Model "not yet known" as an explicit absent value (`undefined`/optional), never as a sentinel union member (e.g. an `"unknown"` string in a status type).
- [ ] **R016** Compute a value that changes with context (a derived count, a relative time, a scroll position) at read time instead of storing it — a cached derived value can drift from the source it was derived from.
