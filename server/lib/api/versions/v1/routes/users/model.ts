import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { DB } from "../../../../../../db";

export namespace UsersPublicModel {

    // Public projection of a user — only non-sensitive fields are exposed.
    export const PublicUser = createSelectSchema(DB.Tables.users).pick({
        id: true,
        username: true,
        display_name: true,
    });
    export type PublicUser = z.infer<typeof PublicUser>;

    export namespace Search {
        export const Query = z.object({
            q: z.string().min(1).max(64).meta({ description: "Search term matched against username and display name." }),
        });
        export type Query = z.infer<typeof Query>;

        export const Response = z.array(PublicUser);
        export type Response = z.infer<typeof Response>;
    }
}
