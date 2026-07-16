import { type entityKind, sql } from 'drizzle-orm';
import type { drizzle as drizzle_d1 } from 'drizzle-orm/d1';
import type { drizzle as drizzle_bun } from 'drizzle-orm/bun-sqlite';
import { BaseSQLiteDatabase, int } from 'drizzle-orm/sqlite-core';
import type { BatchItem, BatchResponse } from 'drizzle-orm/batch';
import type { Database } from 'bun:sqlite';

export declare class DrizzleDB extends BaseSQLiteDatabase<"async" | "sync", void, Record<string, never>> {
    static readonly [entityKind]: string;
    $client?: any;
    batch?: any;
}

export namespace DrizzleDB {
    export type BunSQLite = ReturnType<typeof drizzle_bun>;
    export type D1 = ReturnType<typeof drizzle_d1>;
}

export namespace SQLUtils {

    export function getCreatedAtColumn(name: string = "created_at") {
        // return int(name, { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`);
        return int(name, { mode: 'number' }).notNull().default(sql`(unixepoch() * 1000)`);
    }

}