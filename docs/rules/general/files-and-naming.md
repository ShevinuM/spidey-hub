# Files, naming & structure

How files, directories, and the types inside them are named and organized.

## Files & concepts

- [ ] **R001** Plain `.ts` module filenames are kebab-case (`repo-tree.ts`). A Svelte component is `PascalCase.svelte` matching its exported component name. A view's state class is `<name>State.svelte.ts`, camelCase, matching the orchestrator component it belongs to (`repositoriesState.svelte.ts` for `Repositories.svelte`).
- [ ] **R002** Give each meaningful concept its own file — a panel, an overlay, a state class. The feature folder, not the file, is the unit of cohesion; a feature is organized by concept, not by technical kind.
- [ ] **R003** A type used by only one module lives in that module — don't hoist a prop-interface or a local union out to a shared file by reflex.
- [ ] **R004** A type stays local to its module unless another module needs it; export a type only when a real consumer needs it.
- [ ] **R005** Never create a generic `types/` folder or a per-feature `*-types.ts` file — a file named for a technical kind becomes a free-floating shared-types bucket. When a type earns its own file, name it for the concept (`view-id.ts`, not `types.ts`).
- [ ] **R006** Sharing is by placement, not pooling: a type a feature's own components/state need but that no other feature needs stays inside that feature; a type another feature needs is promoted to `common/` (see `architecture.md`). Never a catch-all bucket.
- [ ] **R007** Promote a co-located type to its own concept-named file only when one of these appears, not before: it needs a runtime value (not just a type), it's imported by several modules beyond its owner, or it grows associated logic (a lookup table, ordering, labels).
- [ ] **R008** Don't add internal barrel `index.ts` re-export files inside a feature — they invite import cycles and hide real dependencies. Import the concept file directly.
- [ ] **R009** A sub-directory earns its keep only when it makes visible a grouping axis the filenames don't already carry, and only when the group has enough members for the axis to matter — don't nest a folder one level deeper "for tidiness" when the existing flat names already read fine in an editor tab bar.

## Svelte component + state-class pattern

- [ ] **R010** A non-trivial view lives in its own folder as: one orchestrator `<Name>.svelte` (props, keymap/dispatch, top-level layout, wiring of children — the folder's public identity), exactly one `<name>State.svelte.ts` state class (every `$state`/`$derived`/`$effect` for the view), and child `.svelte` components, one per major markup region. Never split a view's reactive state across multiple classes, and never add a second state class to one view.
- [ ] **R011** Pure logic with no DOM dependency and no Svelte runes goes in a feature's `lib/*.ts`, not into the state class — a state class holds reactive view state, not standalone functions a unit test could call directly.
- [ ] **R012** A component that's small, single-file, and unlikely to grow (no meaningfully separable panels, no reused row chrome) stays flat in the feature's `components/` — applying the full folder + state-class split to it would add files without reducing complexity anywhere.

## Content

- [ ] **R013** Content a human would write/edit as prose or a record with its own identity (one role, one project, one help topic) is one file per record in a feature's `content/` collection — never several records batched into one file.

## Testids

- [ ] **R014** A `data-testid` on a new element in an existing feature uses that feature's existing prefix (`repositories-*`, `employment-*`, `notifications-*`) — never an unprefixed or inconsistently-prefixed id. A brand-new feature picks one prefix (its own name) for every testid it introduces. This is what keeps `../tech-stack/playwright.md`'s `getByTestId` ranking useful at scale — an unprefixed id is a collision waiting to happen the moment two features grow a similarly-named row.
