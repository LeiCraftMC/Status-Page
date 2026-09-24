import type { DB } from "../db";
import type { StatusPageAdminModel } from "../lib/api/versions/v1/routes/status-pages/model";

declare module "hono" {
    interface ContextVariableMap {
        targetMonitor: DB.Models.Monitor;
        targetIncident: DB.Models.Incident;
        targetMaintenance: DB.Models.Maintenance;
        targetGroup: StatusPageAdminModel.BaseGroup;
        targetLink: StatusPageAdminModel.BaseLink;
    }
}

export {};
