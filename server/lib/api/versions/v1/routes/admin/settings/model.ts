import z from "zod";

export namespace SettingsModel {

    export const SettingsKeys = {
        DEFAULT_THEME: 'default_theme',
    } as const;

    export const Body = z.object({
        default_theme: z.enum(['light', 'dark', 'auto']).optional(),
    }).refine(
        (data) => Object.values(data).some((value) => value !== undefined),
        { message: "At least one setting must be provided" }
    );
    export type Body = z.infer<typeof Body>;

    export const Response = z.object({
        default_theme: z.enum(['light', 'dark', 'auto']),
    });
    export type Response = z.infer<typeof Response>;
}
