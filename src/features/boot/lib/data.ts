// boot.yaml (config) + src/features/boot/content/log.md (log text)
import bootRaw from "../content/boot.yaml?raw";
import { parseYaml } from "../../../common/lib/yaml";
import type { CollectionEntry } from "astro:content";
import type { BootConfig, BootData } from "../../../common/lib/data";

export const buildBoot = (entries: CollectionEntry<"boot">[]): BootData => {
  const config = parseYaml<BootConfig>(bootRaw, "boot.yaml");
  const textById = new Map(entries.flatMap((e) => e.data.entries).map((row) => [row.id, row]));
  const log = config.log.map((row) => {
    const text = textById.get(row.id);
    if (!text) throw new Error(`src/features/boot/lib/data.ts: boot.yaml log id "${row.id}" has no matching src/content/boot entry`);
    return { threshold: row.threshold, tag: row.tag, label: text.label, val: text.val };
  });
  const unmatched = [...textById.keys()].filter((id) => !config.log.some((row) => row.id === id));
  if (unmatched.length > 0) {
    throw new Error(`src/features/boot/lib/data.ts: src/content/boot has entries with no matching boot.yaml log id: ${unmatched.join(", ")}`);
  }
  return { ...config, log };
};
