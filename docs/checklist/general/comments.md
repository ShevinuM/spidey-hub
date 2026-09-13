# Comments & in-source documentation

The comment discipline for everything under `src/`. Comments here are for a future reader of the code, not scratch notes.

## What earns a comment

- [ ] **R001** Comments earn their place by adding meaning or a non-obvious "why" the code can't express on its own — never by narrating language mechanics or restating what the next line already says. Code should be self-documenting first.
- [ ] **R002** A comment never explains a language feature or walks through a concept the reader is expected to already know. Teaching/rationale belongs in project docs, not shipped source.
- [ ] **R003** When a comment is found to be misleading or adds no value, delete it, don't reword it — the code should carry the meaning.
- [ ] **R004** An assumption or edge case at a function's boundary earns a comment only when TypeScript itself can't express it — a runtime invariant, an ordering guarantee, a caller contract no type captures. If the constraint can instead be encoded as a narrower type or a discriminated union (see `../tech-stack/typescript.md`), encode it there and skip the comment.

## The two kinds of comment

- [ ] **R005** `/** ... */` doc comments sit on declarations and are the hover surface — they describe what the thing is/does. `//` line comments are internal notes (implementation "why", structural banners) that don't surface in hover.
- [ ] **R006** A doc comment stays attached to its declaration — a new type declaration goes above the doc comment, never between it and the thing it documents — and an existing doc comment isn't reworded just because a signature changed with no behavior change.

## One home per concept

- [ ] **R007** Document each non-obvious concept in exactly one home. A getter that merely exposes a value already documented elsewhere (its type, its state class) carries no doc comment of its own.
- [ ] **R008** A documented caveat lives in one home: a caveat that applies system-wide (e.g. "fixture mode never fixture-switches this collection") is documented once at the site that owns it; other sites get a one-line pointer, not a duplicate essay.

## Process prose & TODOs

- [ ] **R009** A shipped comment states only a current constraint, never a plan, iteration, phase, or "locked decision" reference — no "now its own component", no "once the rewrite lands", no "Phase 3 will...". The single exception is a proper `// TODO` parking a real, deferred decision at its code site. The moment the constraint a comment describes stops holding, delete the comment — don't leave it updated-in-place as a historical marker.
- [ ] **R010** A TODO must point at real future work — never rationalize a settled decision or a known-wrong current state. A TODO that restates a choice already made is stale; delete it.
- [ ] **R011** A deliberate simplification with a known ceiling is marked `// TODO(scaling)`, naming the ceiling and the upgrade path (e.g. "linear scan fine under ~50 repos; index if that grows").

## Commented-out code

- [ ] **R012** Never leave commented-out code in `src/`, no exceptions for "just in case." Delete it outright — git history is the record of what used to be there. This includes a stray debug `console.log`/`console.debug` left behind with a comment explaining why it's there; delete the whole line, not just the explanation.

## Length and format discipline

- [ ] **R013** A `//` line comment is one sentence. A `/** ... */` doc comment's summary line is one sentence too; anything beyond that is a separate paragraph below the summary, not a run-on first line. If landing the point needs multiple paragraphs, the function or type underneath is very likely doing too much — split it before reaching for more prose.

## Before you write

- [ ] **R014** Before adding or editing a comment in `src/`, re-read this file. Over-commenting is the recurring failure mode this discipline exists to prevent.
- [ ] **R015** Before keeping a comment, run the phone test: could you explain the reasoning to someone over a call using only the comment, without pointing at the line it sits on? If it doesn't clear that bar, it isn't saying enough — sharpen it or delete it.

## Legacy references

- [ ] **R016** A shipped comment never references a legacy concept, a prior implementation, or "the old way" — no "unlike the previous version", no "this replaces X", no "v1 used to...", no "formerly". Describe only what the current code does and why; the git history is the record of what it used to be.
