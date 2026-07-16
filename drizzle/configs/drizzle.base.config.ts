import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    out: `./drizzle/migrations`,
    schema: './server/db/schema.ts',
    dialect: 'sqlite',
    verbose: true,
    strict: true
});
