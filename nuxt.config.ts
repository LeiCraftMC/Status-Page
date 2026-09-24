import { cloudflareBuildStubs } from './build/cloudflare-stubs';

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

	// The Cloudflare build bundles the whole server into one worker; skipping
	// source maps for it keeps the build's memory use down.
	...(isCloudflareBuild ? { sourcemap: { server: false, client: false } } : {}),

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
			sourcemap: false,
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
			// Stubs Bun-only and unused optional imports (see build/cloudflare-stubs.ts).
			plugins: isCloudflareBuild ? [cloudflareBuildStubs()] : [],
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
