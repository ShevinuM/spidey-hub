// grep.yaml
import grepRaw from "../content/grep.yaml?raw";
import { parseYaml } from "../../../common/lib/yaml";
import type { GrepData } from "../../../common/lib/data";

export const getGrep = (): GrepData => parseYaml<GrepData>(grepRaw, "grep.yaml");
