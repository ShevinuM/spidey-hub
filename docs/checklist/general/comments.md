# Comments & in-source documentation

The comment discipline for everything under `src/`. Comments here are for a future reader of the code, not scratch notes.

## What earns a comment

- [ ] **R001** Comments earn their place by adding meaning or a non-obvious "why" the code can't express on its own — never by narrating language mechanics or restating what the next line already says. Code should be self-documenting first.
- [ ] **R002** A comment never explains a language feature or walks through a concept the reader is expected to already know. Teaching/rationale belongs in project docs, not shipped source.
- [ ] **R003** When a comment is found to be misleading or adds no value, delete it, don't reword it — the code should carry the meaning.

## The two kinds of comment

- [ ] **R004** `/** ... */` doc comments sit on declarations and are the hover surface — they describe what the thing is/does. `//` line comments are internal notes (implementation "why", structural banners) that don't surface in hover.
- [ ] **R005** A doc comment stays attached to its declaration — a new type declaration goes above the doc comment, never between it and the thing it documents — and an existing doc comment isn't reworded just because a signature changed with no behavior change.

## One home per concept

- [ ] **R006** Document each non-obvious concept in exactly one home. A getter that merely exposes a value already documented elsewhere (its type, its state class) carries no doc comment of its own.
- [ ] **R007** A documented caveat lives in one home: a caveat that applies system-wide (e.g. "fixture mode never fixture-switches this collection") is documented once at the site that owns it; other sites get a one-line pointer, not a duplicate essay.

## Process prose & TODOs

- [ ] **R008** A shipped comment states only a current constraint, never a plan, iteration, phase, or "locked decision" reference — no "now its own component", no "once the rewrite lands", no "Phase 3 will...". The single exception is a proper `// TODO` parking a real, deferred decision at its code site. The moment the constraint a comment describes stops holding, delete the comment — don't leave it updated-in-place as a historical marker.
- [ ] **R009** A TODO must point at real future work — never rationalize a settled decision or a known-wrong current state. A TODO that restates a choice already made is stale; delete it.
- [ ] **R010** A deliberate simplification with a known ceiling is marked `// TODO(scaling)`, naming the ceiling and the upgrade path (e.g. "linear scan fine under ~50 repos; index if that grows").

## Before you write

- [ ] **R011** Before adding or editing a comment in `src/`, re-read this file. Over-commenting is the recurring failure mode this discipline exists to prevent.
