// Pure Node port-picking helper — no Astro/Svelte/DOM import, so
// scripts/tests/unit/freePort.test.ts can exercise it directly under `node --test`,
// same "DOM-free module a unit test imports" convention `src/lib/*.ts`
// follows (docs/agent-checklist.md's project-structure section), just rooted
// under scripts/ instead since this is build-tooling logic, not app logic.
//
// PLAN.md Phase 7.4 / iteration-6 post-mortem "standing hazards":
// scripts/capture-screenshots.mjs used to hardcode PORT = 4323, which
// silently collided with a running `astro dev` (Astro falls back to 4322,
// 4323, ... when 4321 is taken). `pickPort` replaces that hardcoded
// constant with a dynamic pick that prefers the given port but never fails
// just because something else already has it.
import { createServer } from "node:net";

export interface PickedPort {
  port: number;
  /** False when `preferred` was occupied and an OS-assigned port was used
   * instead — callers should log this so a collision is visible, not just
   * silently worked around. */
  usedPreferred: boolean;
}

/**
 * Resolves to a free TCP port on 127.0.0.1: `preferred` itself if nothing
 * is bound to it, otherwise an OS-assigned free port (`listen(0)`). Never
 * rejects merely because `preferred` is taken — only for a genuine bind
 * error on the fallback attempt.
 *
 * Binds-and-releases rather than merely probing: there is a small window
 * between the probe closing and the real caller binding the same port
 * where another process could grab it first (the same inherent race every
 * "find a free port" helper has, `get-port` included) — acceptable here
 * since this only gates a local documentation-screenshot script, not a
 * security boundary.
 */
export function pickPort(preferred: number): Promise<PickedPort> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EADDRINUSE") {
        reject(err);
        return;
      }
      const fallback = createServer();
      fallback.once("error", reject);
      fallback.listen(0, "127.0.0.1", () => {
        const address = fallback.address();
        const port = typeof address === "object" && address ? address.port : NaN;
        fallback.close(() => resolve({ port, usedPreferred: false }));
      });
    });
    probe.listen(preferred, "127.0.0.1", () => {
      probe.close(() => resolve({ port: preferred, usedPreferred: true }));
    });
  });
}
