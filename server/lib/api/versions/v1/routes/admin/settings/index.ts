import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { DB } from "../../../../../../../db";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { SettingsModel } from "./model";
import { DOCS_TAGS } from "../../../docs";

export const router = new Hono().basePath('/settings');

router.get('/',

    APIRouteSpec.authenticated({
        summary: "Get settings",
        description: "Retrieve global application settings.",
        tags: [DOCS_TAGS.ADMIN_SETTINGS],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Settings retrieved successfully", SettingsModel.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    async (c) => {
        const settings = await getSettings();
        return APIResponse.success(c, "Settings retrieved successfully", settings);
    }
);

router.put('/',

    APIRouteSpec.authenticated({
        summary: "Update settings",
        description: "Update global application settings such as the default theme.",
        tags: [DOCS_TAGS.ADMIN_SETTINGS],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Settings updated successfully", SettingsModel.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    zValidator("json", SettingsModel.Body),

    async (c) => {
        const body = c.req.valid("json") as SettingsModel.Body;

        for (const [key, value] of Object.entries(body)) {
            if (value === undefined) continue;

            await DB.instance()
                .insert(DB.Tables.settings)
                .values({ key, value })
                .onConflictDoUpdate({
                    target: DB.Tables.settings.key,
                    set: { value },
                })
                .run();
        }

        const settings = await getSettings();
        return APIResponse.success(c, "Settings updated successfully", settings);
    }
);

export async function getSettings(): Promise<SettingsModel.Response> {
    const rows = await DB.instance().select().from(DB.Tables.settings);
    const map = new Map(rows.map((r) => [r.key, r.value]));

    return {
        default_theme: map.get(SettingsModel.SettingsKeys.DEFAULT_THEME) ?? 'auto',
    };
}
