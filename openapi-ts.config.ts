import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
    input: 'http://127.0.0.1:12337/docs/v1/openapi',
    output: 'app/api-client',
    plugins: [
        '@hey-api/client-nuxt',
        "@hey-api/typescript",
        "@hey-api/sdk",
        "zod"
    ]
});