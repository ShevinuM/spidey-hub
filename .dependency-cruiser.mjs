// The graph half of `pnpm architecture`.
//
// It runs SECOND, after the text scanner in `tests/audits/boundaries.test.ts`
// (`pnpm check:arch`), and the two layers are not interchangeable.
//
// THE SCANNER OWNS DIRECT EDGES, ACROSS EVERY FILE TYPE. It reads source text,
// so it sees the two whole classes of crossing a resolver cannot:
//   - `?raw` query-suffixed specifiers (Vite asset imports), which no module
//     resolver can see, and
//   - `.astro` files, which hold 37 of the 209 boundary-crossing imports in
//     `src/`. `.astro` is not in this tool's extension map: an `.astro`
//     importing a `.svelte` and a `.ts` does not appear in the output at all.
//     `extraExtensionsToScan: [".astro"]` is NOT the fix and is deliberately not
//     set — it makes `.astro` files appear as graph nodes with ZERO
//     dependencies, so a genuinely violating `.astro` would read as clean.
//     That is a worse failure than invisibility. The scanner owns `.astro`.
//
// THIS CONFIG OWNS THE GRAPH — the one thing a per-file text scan structurally
// cannot do: resolve modules and follow them. Hence exactly two rules: cycles,
// and feature-reaches-feature *through an intermediary*.
//
// KNOWN HOLE, recorded rather than discovered later: a type-only import written
// inside a `.svelte` file produces no edge here, and cannot. `.svelte` is not in
// the tool's TS-compatible extension set, so SFCs always go through the
// compile-then-parse path, and the Svelte 5 compiler strips types before this
// tool ever sees the source. Measured: 41 `.svelte` files carry ~60 local
// type-only specifiers. `tsPreCompilationDeps` below does not rescue them — it
// is still set, and still load-bearing, because it DOES give type-only edges for
// `.ts`/`.mts`/`.js`/`.mjs`, including the `*.svelte.ts` rune-state modules
// (resolved as TypeScript). Consequence: a transitive chain whose FIRST hop is a
// type-only import out of a `.svelte` file is invisible to the cruise. The
// scanner still catches that hop as a direct edge. That is why both layers stay.
//
// CANARY: `tests/audits/cruise-canary.test.ts` guards the one failure mode that
// leaves this config green over a graph with no `.svelte` files in it, and
// explains it.

/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "A dependency cycle is a design defect the per-file text scanner cannot see, because no single file is wrong.",
      from: {},
      to: { circular: true },
    },
    {
      // `reachable: true` is the "A reaches B directly OR through anything"
      // rule, and `$1` back-references the capture in `from.path`, so the pair
      // reads as "feature X must not reach feature not-X".
      //
      // The `err-long` reporter prints the intermediate hops, which is the
      // entire point of the rule, so `pnpm architecture` pins that reporter.
      name: "no-transitive-peer-feature",
      severity: "error",
      comment:
        "architecture.md R004: no feature imports another feature — not directly, and not by routing through common/ or any other intermediary.",
      from: { path: "^src/features/([^/]+)/" },
      to: {
        path: "^src/features/([^/]+)/",
        pathNot: "^src/features/$1/",
        reachable: true,
      },
    },
  ],
  options: {
    // Load-bearing for every extension except `.svelte` — see KNOWN HOLE above.
    tsPreCompilationDeps: true,

    doNotFollow: { path: "node_modules" },

    // `^svelte/internal` covers both Svelte 5 phantoms — `svelte/internal/client`
    // and `svelte/internal/disclose-version` — which the compiler injects into
    // every SFC and which resolve to nothing. `^astro:` covers `astro:content`
    // and friends, unresolvable by design (they are virtual modules Astro
    // supplies at build time).
    //
    // `(^|/)tests/` excludes the test trees, and that is a MEASURED decision,
    // not a convenience. Cruised WITH the test trees in, this config reported 50
    // violations, 0 of them cycles. Every one of the 50 is a spec file under one
    // feature's `tests/` reaching another feature, and every one routes through
    // exactly one of four direct edges:
    //   common/tests/ui/support/fixtures.ts -> features/boot/lib/boot-state          (19)
    //   common/tests/ui/support/fixtures.ts -> features/notifications/lib/notification-store (15)
    //   common/tests/ui/support/pipeline.mjs -> features/notifications/lib/toast-seed  (8)
    //   common/tests/ui/support/pipeline.mjs -> features/boot/lib/boot-state           (8)
    // All four are already in the scanner's ALLOWLIST, dated and marked
    // PERMANENT, DECIDED: shared Playwright fixtures must seed the same storage
    // keys the features read. So the cruise was re-reporting, as transitive
    // findings, four direct edges the scanner already governs — and recording
    // them here would author a second baseline of the same decision in a second
    // place. The scanner remains the single owner of those four edges; if one is
    // ever deleted, the scanner fails on the stale entry. No production source
    // lives under a `tests/` directory, so nothing the graph rule exists to
    // catch is hidden by this.
    exclude: { path: "^svelte/internal|^astro:|(^|/)tests/" },
  },
};
