// Shared yaml-parse cache. Each caller (common's own loaders in data.ts, and
// every feature's own `lib/data.ts`) imports its `?raw` yaml string itself
// and calls `parseYaml` here with a key unique to that file, since Astro's
// static build bundles this module away from the source directory on disk
// and a runtime `node:fs` read is not available. This module carries no
// registry of its own `?raw` imports — a registry here would re-create
// every common->feature content edge the per-feature loaders exist to
// remove.
import YAML from "yaml";

const cache = new Map<string, unknown>();

/** Parses `raw` once per `key`; a repeat call for the same `key` returns the
 * cached parse instead of running the yaml parser again. */
export function parseYaml<T>(raw: string, key: string): T {
  const cached = cache.get(key);
  if (cached !== undefined) return cached as T;
  const parsed = YAML.parse(raw) as T;
  cache.set(key, parsed);
  return parsed;
}
