import { eq } from "drizzle-orm";
import { DB } from "../../../db/index";
import { z } from "zod";

export class InstanceSettings {

    protected static readonly schemas = {
        "owner": z.object({ userId: z.number() }).default({ userId: 0 }),
    } as const;

    protected static async getInstanceSetting<T extends keyof typeof this.schemas>(key: T, createIfNotFound = false): Promise<z.infer<(typeof this.schemas)[T]>> {
        const record = await DB.instance().select().from(DB.Tables.instanceSettings).where(
            eq(DB.Tables.instanceSettings.key, key)
        ).get();

        if (!record) {

            if (!createIfNotFound) {
                throw new Error(`Instance Setting with key '${key}' not found`);
            }

            const defaultData = this.schemas[key].parse(undefined);
            await DB.instance().insert(DB.Tables.instanceSettings).values({
                key: key,
                value: JSON.stringify(defaultData),
            });
            return defaultData;
        }

        return this.schemas[key].parse(JSON.parse(record.value));
    }

    protected static async setInstanceSetting<T extends keyof typeof this.schemas>(key: T, data: z.infer<(typeof this.schemas)[T]>): Promise<void> {
        await DB.instance().update(DB.Tables.instanceSettings).set({
            value: JSON.stringify(data),
        }).where(
            eq(DB.Tables.instanceSettings.key, key)
        );
    }


    static async getInstanceOwnerUserID(): Promise<{ userId: number }> {
        return await this.getInstanceSetting("owner", true);
    }
    static async setInstanceOwnerUserID(userId: number): Promise<void> {
        await this.setInstanceSetting("owner", { userId });
    }

}
