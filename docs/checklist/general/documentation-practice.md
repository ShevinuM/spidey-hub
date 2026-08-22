# Documentation practice

How this project's own documentation (including this checklist) is written and maintained.

- [ ] **R001** Rule docs are prescriptive and standalone: each rule states what to do and why in one entry; a normative rule says must/never, a guidance rule says prefer; narrow exceptions are stated inline rather than left implicit.
- [ ] **R002** Documentation cross-references rather than duplicates — each doc owns its own altitude and doesn't repeat its neighbors (naming sits on top of architecture; neither restates the other).
- [ ] **R003** Docs are updated in the same change that invalidates them — a decision lands with its checklist entry; a mechanism change sweeps every doc that described the old mechanism.
- [ ] **R004** A new ruling is added to the relevant checklist file as a short, prescriptive entry at the moment it's decided — not batched for later.
- [ ] **R005** A code change that alters a canonical example file (one this checklist or another doc points at) updates the doc's pointer in the same change.
- [ ] **R006** When docs and code drift, resolve by converging the code toward the documented decision — not by rewriting the doc to match wayward code — unless the doc never actually recorded a real decision in the first place.
- [ ] **R007** A working document (a design sketch, a migration plan) carries an explicit status header and names its own source of truth — a hypothesis is something to test, not something to build from as if settled.
- [ ] **R008** A deferred/out-of-scope list is explicit and honest ("not doing this", "deferred until X") so absence reads as a decision, not an omission.
- [ ] **R009** README-level run instructions stay minimal and real — the actual commands that work today, nothing aspirational.
