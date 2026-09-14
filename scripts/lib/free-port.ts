// Pure Node port-picking helper — no Astro/Svelte/DOM import, so
// scripts/tests/unit/free-port.test.ts can import it directly.
//
// Ports must be probed, not hardcoded: pickPort's caller may share a
// machine with an already-running dev server bound to the same preferred
// port.
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
 * since this only gates local dev-tooling scripts (screenshot capture,
 * design-mirror generation), not a security boundary.
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
