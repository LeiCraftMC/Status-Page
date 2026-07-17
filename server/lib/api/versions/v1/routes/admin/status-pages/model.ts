import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { DB } from "../../../../../../../db";
import z from "zod";

export namespace StatusPageAdminModel {

    export const BaseConfig = createSelectSchema(DB.Tables.statusPageConfig);
    export type BaseConfig = z.infer<typeof BaseConfig>;

    export const BaseGroup = createSelectSchema(DB.Tables.monitorGroups);
    export type BaseGroup = z.infer<typeof BaseGroup>;

    export const BaseLink = createSelectSchema(DB.Tables.monitorGroupAssignments);
    export type BaseLink = z.infer<typeof BaseLink>;

    export namespace Config {
        export const Body = createInsertSchema(DB.Tables.statusPageConfig, {
            title: z.string().min(1).max(128),
            description: z.string().max(512).optional(),
        }).omit({
            id: true,
            created_at: true,
            updated_at: true,
        }).partial().refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type Body = z.infer<typeof Body>;

        export const Response = BaseConfig;
        export type Response = z.infer<typeof Response>;
    }

    export namespace FullPage {
        export const Response = z.object({
            config: BaseConfig,
            groups: z.array(BaseGroup),
            links: z.array(BaseLink.extend({
                monitor_name: z.string(),
            })),
        });
        export type Response = z.infer<typeof Response>;
    }

    export namespace GroupId {
        export const Params = z.object({
            groupId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;
    }

    export namespace LinkId {
        export const Params = z.object({
            linkId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;
    }

    export namespace CreateGroup {
        export const Body = z.object({
            name: z.string().min(1).max(128),
            sort_order: z.coerce.number().int().default(0),
        });
        export type Body = z.infer<typeof Body>;

        export const Response = BaseGroup;
        export type Response = z.infer<typeof Response>;
    }

    export namespace UpdateGroup {
        export const Body = z.object({
            name: z.string().min(1).max(128).optional(),
            sort_order: z.coerce.number().int().optional(),
        }).refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type Body = z.infer<typeof Body>;

        export const Response = BaseGroup;
        export type Response = z.infer<typeof Response>;
    }

    export namespace CreateLink {
        export const Body = z.object({
            monitor_id: z.coerce.number().int().positive(),
            group_id: z.coerce.number().int().positive().optional(),
            display_name: z.string().min(1).max(128).optional(),
            sort_order: z.coerce.number().int().default(0),
        });
        export type Body = z.infer<typeof Body>;

        export const Response = z.object({
            link: BaseLink,
        });
        export type Response = z.infer<typeof Response>;
    }

    export namespace UpdateLink {
        export const Body = z.object({
            group_id: z.coerce.number().int().positive().optional().nullable(),
            display_name: z.string().min(1).max(128).optional().nullable(),
            sort_order: z.coerce.number().int().optional(),
        }).refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type Body = z.infer<typeof Body>;

        export const Response = z.object({
            link: BaseLink,
        });
        export type Response = z.infer<typeof Response>;
    }
}
