# Classes

When to reach for a class, encapsulation, and construction invariants. TypeScript-specific type/import/compiler discipline lives in `../tech-stack/typescript.md` — not repeated here.

## When to reach for a class

- [ ] **R001** Use a `class` only for a view's reactive state (the `<name>State.svelte.ts` pattern) or for something with real behavior + invariants. Inert data crossing a boundary — props, content-collection records, generated JSON — is a `type`/`interface`, never a class.
- [ ] **R002** A method mutates and returns `void`; a getter/derived reads a value and mutates nothing. A method that needs to hand back a result while also mutating state is a smell — reconsider the shape before returning data from a mutator.

## Encapsulation

- [ ] **R003** Prefer `#` private fields for a state class's per-instance state over the `private` keyword — `#` is enforced at runtime, `private` is erased at compile time and reachable via `obj['field']`.
- [ ] **R004** Expose state read-only through a getter paired with the `#`/private field. No public mutable fields.
- [ ] **R005** Don't add a getter per field by reflex — expose one only once a real caller needs to read it.
- [ ] **R006** Never expose a bare setter. State changes go through an intention-revealing method named for what it does, not `set x(...)`.

## Construction & invariants

- [ ] **R007** Enforce invariants in the constructor, before assigning fields — an object should never exist in an invalid state.
- [ ] **R008** Every field is definitely assigned either by a constructor assignment or a field initializer — never delegate field initialization to a helper method called from the constructor.
- [ ] **R009** Avoid the `!` definite-assignment assertion — it silences the compiler with zero runtime safety. Acceptable only for a field a framework provably assigns (e.g. a Svelte binding).
- [ ] **R010** A plain constructor is the default; reach for a `static` factory only when construction genuinely needs multiple steps or must narrow/override the constructor's inputs to enforce an invariant.

## Member order & error messages

- [ ] **R011** A consistent class member order keeps state classes scannable: public constants → private/`#` fields → constructor → static factories → getters → behavior methods. Group getters and behavior methods under a short banner comment when a class has both.
- [ ] **R012** Thrown errors are complete sentences that name the offending value or identifier (`A repo name must not be empty, got "".`), never a bare generic message.
