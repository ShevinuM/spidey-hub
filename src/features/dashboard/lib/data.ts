// dashboard.yaml
import dashboardRaw from "../content/dashboard.yaml?raw";
import { parseYaml } from "../../../common/lib/yaml";
import type { DashboardData } from "../../../common/lib/data";

export const getDashboard = (): DashboardData => parseYaml<DashboardData>(dashboardRaw, "dashboard.yaml");
