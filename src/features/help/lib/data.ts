// help.yaml + helpsearch.yaml + src/features/help/content/*.md
import helpRaw from "../content/help.yaml?raw";
import helpsearchRaw from "../content/helpsearch.yaml?raw";
import { parseYaml } from "../../../common/lib/yaml";
import type { CollectionEntry } from "astro:content";
import type { HelpChrome, HelpData, HelpSearchData } from "../../../common/lib/data";

export const getHelpChrome = (): HelpChrome => parseYaml<HelpChrome>(helpRaw, "help.yaml");

export const getHelpSearch = (): HelpSearchData => parseYaml<HelpSearchData>(helpsearchRaw, "helpsearch.yaml");

export const buildHelp = (entries: CollectionEntry<"help">[]): HelpData => {
  const scopes = entries
    .slice()
    .sort((a, b) => a.data.order - b.data.order)
    .map((e) => ({ id: e.id, label: e.data.label, hint: e.data.hint, rows: e.data.rows }));
  return { ...getHelpChrome(), scopes };
};
