// personnel.yaml
import personnelRaw from "../content/personnel.yaml?raw";
import { parseYaml } from "../../../common/lib/yaml";
import type { PersonnelData } from "../../../common/lib/data";

export const getPersonnel = (): PersonnelData => parseYaml<PersonnelData>(personnelRaw, "personnel.yaml");
