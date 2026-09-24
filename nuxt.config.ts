import { cloudflareBuildStubs } from './build/cloudflare-stubs';
import { COMPATIBILITY_DATE, getCloudflareTarget, nitroWranglerConfig, writeCronWorkerConfig } from './build/cloudflare-config';

// Set by the `build:cf*` scripts (see build/cloudflare-config.ts). Enables the
// Cloudflare-only build settings below; the Bun build is unaffected.
const cloudflareTarget = getCloudflareTarget();
const isCloudflareBuild = cloudflareTarget !== null;

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: COMPATIBILITY_DATE,
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
			// Nitro generates the app's wrangler config from this:
			// `.output/server/wrangler.json` (Workers) or `dist/_worker.js/wrangler.json`
			// (Pages), plus a redirect in `.wrangler/deploy/` so `wrangler deploy` /
			// `wrangler dev` find it (`wrangler d1` does not; see the db:d1:* scripts).
			cloudflare: {
				deployConfig: true,
				nodeCompat: true,
				wrangler: nitroWranglerConfig(cloudflareTarget!),
			},
		} : {}),
		rollupConfig: {
			external: ['bun:sqlite', 'cloudflare:sockets'],
			// Stubs Bun-only and unused optional imports (see build/cloudflare-stubs.ts).
			plugins: isCloudflareBuild ? [cloudflareBuildStubs()] : [],
		},
	},

	hooks: {
		'nitro:init'(nitro) {
			if (cloudflareTarget === 'pages') {
				// Pages can't run cron triggers: the monitor checks run in a separate
				// Worker, whose config is written next to the build. (Registered here
				// rather than in `nitro.hooks`, which would replace the preset's own
				// `compiled` hook instead of adding to it.)
				nitro.hooks.hook('compiled', () => writeCronWorkerConfig(nitro.options.rootDir));
			}
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
		"/**": { ssr: true },

		// On Workers, rendering a page costs more CPU than the Free plan's 10 ms
		// per request, so rendered public pages are cached for 30 s (Nitro's
		// cache lives in the isolate's memory) and refreshed in the background.
		// Only safe because these pages render the same for every visitor: they
		// must never show anything based on the session cookie.
		...(isCloudflareBuild ? {
			"/": { swr: 30 },
			"/incidents": { swr: 30 },
			"/incident/**": { swr: 30 },
			"/scheduled-events": { swr: 30 },
			"/scheduled-events/**": { swr: 30 },
			"/monitors/**": { swr: 30 },
		} : {}),
	}
});
