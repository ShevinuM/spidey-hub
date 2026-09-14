// shell.yaml
import shellRaw from "../content/shell.yaml?raw";
import { parseYaml } from "../../../common/lib/yaml";
import type { ShellData } from "../../../common/lib/data";

export const getShell = (): ShellData => parseYaml<ShellData>(shellRaw, "shell.yaml");
