# Svelte 5

Rune-level rules. The orchestrator-component + state-class folder pattern lives in `../general/files-and-naming.md` — not repeated here.

## $state

- [ ] **R001** Reach for `$state` only for a value that should be reactive — a value that needs to trigger an `$effect`, `$derived`, or template update. A value read once and never re-read reactively is a plain variable, not `$state`.
- [ ] **R002** An object/array behind `$state` is deep-reactive by default (mutation triggers updates) via a proxy, which carries real overhead. For a large value that's only ever reassigned wholesale, never mutated in place (a fetched API response, a generated JSON blob loaded once), use `$state.raw` instead of paying for proxying nothing will use.

## $derived vs $effect

- [ ] **R003** `$effect` is for side effects only (DOM measurement, subscriptions, timers) — never for deriving a value from other state, even when the derivation feels like "it just needs to run when X changes." That's exactly what `$derived`/`$derived.by` is for; an `$effect` that only assigns a variable from other state is the anti-pattern to catch in review.
- [ ] **R004** An `$effect` that sets up a subscription, interval, or listener returns a teardown function — it runs before the effect re-runs and when the component is destroyed. An effect with a persistent side effect and no returned teardown is a leak.

## Props & parent-child communication

- [ ] **R005** Never mutate a prop directly — mutating a plain object prop has no effect, and mutating a reactive-proxy prop triggers a runtime warning. Pick one of three patterns instead: a callback prop the child calls to report a change, `$bindable()` when the parent and child should share one value via `bind:`, or local `$state` seeded from the prop when the child needs its own independent copy.
- [ ] **R006** Use `$bindable()` deliberately, not by default — it's for the specific case of two-way binding where the parent's own state is meant to change as a direct result of child interaction (a form input), not a general "let the child update stuff" escape hatch.

## Testing

- [ ] **R007** A component test that needs to exercise two-way bindings, context, or snippet props does so through a small wrapper component written for that test, rather than trying to drive those mechanisms from outside the component tree.
