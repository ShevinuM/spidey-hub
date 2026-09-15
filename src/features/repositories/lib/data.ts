// repositories.yaml
import repositoriesRaw from "../content/repositories.yaml?raw";
import { parseYaml } from "../../../common/lib/yaml";
import type { RepositoriesData } from "../../../common/lib/data";

export const getRepositories = (): RepositoriesData =>
  parseYaml<RepositoriesData>(repositoriesRaw, "repositories.yaml");
