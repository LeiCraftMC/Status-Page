import z from "zod";

export namespace SettingsModel {

    export const SettingsKeys = {
        ROOT_STATUS_PAGE_ID: 'root_status_page_id',
        DEFAULT_THEME: 'default_theme',
    } as const;

    export const Body = z.object({
        root_status_page_id: z.coerce.number().int().positive().nullable().optional(),
        default_theme: z.enum(['light', 'dark', 'auto']).optional(),
    }).refine(
        (data) => Object.values(data).some((value) => value !== undefined),
        { message: "At least one setting must be provided" }
    );
    export type Body = z.infer<typeof Body>;

    export const Response = z.object({
        root_status_page_id: z.number().int().nullable(),
        default_theme: z.enum(['light', 'dark', 'auto']),
    });
    export type Response = z.infer<typeof Response>;
}
