import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    out: `./drizzle/migrations`,
    schema: './server/db/schema.ts',
    dialect: 'sqlite',
    dbCredentials: {
        url: process.env.LCCFWSP_DB_PATH!,
    },
    verbose: true,
    strict: true
});
