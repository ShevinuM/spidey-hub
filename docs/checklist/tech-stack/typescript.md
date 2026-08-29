# TypeScript

Compiler-configuration, type-modelling, and narrowing rules. Class/encapsulation conventions live in `../general/classes.md` — this file covers `tsconfig` flags, union/type discipline, and import hygiene.

## Compiler flags beyond `strict`

- [ ] **R001** Settled (pre-phase, 2026-08-29): `noImplicitOverride` is **on** — enabling it against the bulk-imported tree surfaced 0 `tsc --noEmit` errors, so it costs nothing and stays on. `noUncheckedIndexedAccess` is **deferred until after phase 11** — enabling it surfaced 316 errors on the legacy (pre-restructure) tree, far past the ~50 threshold that would make fixing it a mechanical pre-phase task; re-evaluate once the tree is fully restructured into `common`/`src/features/*` (phase 11 close), when the error count and fix locations will actually reflect the target architecture instead of code about to move.
- [ ] **R002** `strictPropertyInitialization` (part of `strict`) requires every class field to be assigned in the constructor or via a field initializer — a compiler-enforced version of the construction-invariant discipline in `../general/classes.md`, not a separate rule to remember.
- [ ] **R003** Never reach for a blanket suppression flag to silence an error class project-wide — fix the specific site, or suppress narrowly at that one line with a comment saying why, so the rest of the codebase keeps the real check.

## Discriminated unions & narrowing

- [ ] **R004** Model a closed set of variants with different shapes as a discriminated union — one interface per variant, each with a unique literal value on the shared discriminant field — rather than one interface with a pile of optional fields. This is the type-level version of `../general/architecture.md` R015 (absence over sentinel): illegal field combinations become unrepresentable instead of merely undocumented.
- [ ] **R005** Narrow a discriminated union with a `switch` on its discriminant (not a chain of `if`/`instanceof`) when there are 3+ variants — the compiler flags a newly added variant left unhandled in every switch that isn't exhaustive.
- [ ] **R006** Destructuring a discriminated union's fields before narrowing still narrows correctly (checking the destructured discriminant narrows the destructured payload too) — prefer destructuring for readability once this is true of the TypeScript version in use; don't avoid it defensively.

## Type modelling

- [ ] **R007** Prefer a string-literal union for a closed set of values over `enum` — unions erase to nothing at runtime, enums emit runtime objects and resist tree-shaking. Use a `const` object with a derived type only when runtime iteration/validation over the set is actually needed.
- [ ] **R008** Use `readonly` for fields that must not change after construction, knowing it's compile-time only — real immutability comes from `#`/private plus getter-only access (see `../general/classes.md`).

## Imports & strict-mode discipline

- [ ] **R009** Import pure types (interfaces, type aliases, unions) with `import type` or an inline `type` modifier — it's erased from the emit and prevents accidental import cycles through type-only edges. A class is a value and is imported normally even where used only in a type position.
- [ ] **R010** When strict mode flags something, fix the code rather than reaching for a narrower compiler flag or an `any` escape hatch. Whether strict mode itself is on is a toolchain gate (`../general/toolchain.md`); this is the day-to-day discipline of keeping it satisfied.
