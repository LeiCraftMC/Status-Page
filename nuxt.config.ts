import { resolve } from 'node:path';

// Set by the `build:cf` script. Enables the Cloudflare-only build settings
// below; the Bun build is unaffected.
const isCloudflareBuild = process.env.CF_BUILD === '1';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: '2025-07-15',
	devtools: { enabled: true },
	modules: ['@nuxt/ui' ],

	colorMode: {
		preference: 'dark',
		fallback: 'dark',
		classSuffix: ''
	},

	ssr: true,

	css: [
		'~/assets/css/main.css',
	],

	nitro: {
		experimental: {
			tasks: true
		},
		scheduledTasks: {
			'* * * * *': 'check-monitors',
		},
		...(isCloudflareBuild ? {
			// Source maps roughly double the memory needed to build the
			// single-file worker bundle.
			sourcemap: false,
			alias: {
				// Bun-only SQLite driver (statically imports `bun:sqlite`, which
				// cannot be bundled for Workers). Never called on Workers.
				'drizzle-orm/bun-sqlite': resolve('./server/stubs/bun-sqlite.ts'),
				'drizzle-orm/bun-sqlite/migrator': resolve('./server/stubs/bun-sqlite.ts'),
				// Schema vendors that hono-openapi's standard-json lazy-imports but
				// this app never uses (it only feeds zod schemas). `effect` alone
				// would blow both the worker size limit and the build's memory.
				'effect': resolve('./server/stubs/schema-vendors.ts'),
				'sury': resolve('./server/stubs/schema-vendors.ts'),
				'@valibot/to-json-schema': resolve('./server/stubs/schema-vendors.ts'),
				// Optional peers that are only used for zod v3 (this app uses zod v4);
				// not installed by a clean `bun install`.
				'zod-to-json-schema': resolve('./server/stubs/schema-vendors.ts'),
				'zod-openapi': resolve('./server/stubs/schema-vendors.ts'),
			},
			// Nitro generates `.output/server/wrangler.json` from this (adding
			// `main`, `assets`, `compatibility_date` and the `nodejs_compat`
			// flag itself) plus a redirect in `.wrangler/deploy/`, so plain
			// `wrangler deploy` / `wrangler dev` pick it up after a build
			// (`wrangler d1` does not follow the redirect; see the db:d1:* scripts).
			cloudflare: {
				deployConfig: true,
				nodeCompat: true,
				wrangler: {
					name: 'leicraftmc-status-page',
					d1_databases: [{
						binding: 'DB',
						database_name: 'leicraftmc-status-page',
						// From `wrangler d1 create leicraftmc-status-page`.
						// Only needed for remote (production) access.
						database_id: process.env.CLOUDFLARE_D1_DATABASE_ID || 'local-only',
						// Relative to the generated .output/server/wrangler.json.
						migrations_dir: '../../drizzle/migrations',
					}],
					// Runs the `check-monitors` scheduled task (see scheduledTasks).
					triggers: { crons: ['* * * * *'] },
					// Runtime configuration (see server/utils/config.ts).
					// Migrations run via wrangler, not on boot.
					vars: {
						LCCFWSP_LOG_LEVEL: 'info',
						LCCFWSP_API_DISABLE_DOCS: 'false',
						LCCFWSP_DB_AUTO_MIGRATE: 'false',
						LCCFWSP_APP_URL: process.env.LCCFWSP_APP_URL || 'http://localhost:8787',
					},
					// Keeps logs (e.g. the one-time initial admin reset URL).
					observability: { enabled: true },
				},
			},
		} : {}),
		rollupConfig: {
			external: ['bun:sqlite', 'cloudflare:sockets'],
		},
	},

	runtimeConfig: {
		public: {
			//@ts-ignore
			appUrl: process.env.LCCFWSP_APP_URL || 'http://localhost:12336',
		}
	},

	routeRules: {
		"/dashboard/**": { ssr: false },
		"/auth/**": { ssr: false },
		"/**": { ssr: true }
	}
});
