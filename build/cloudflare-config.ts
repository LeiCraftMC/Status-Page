import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Cloudflare deployment settings, shared by every Cloudflare target so the
 * database binding and runtime variables are defined once.
 *
 * Two ways to deploy (chosen with `CF_TARGET` at build time):
 *
 * - `workers` (default): one Worker serves the app and runs the monitor cron.
 *   Custom domains need the domain's DNS on Cloudflare.
 * - `pages`: the app runs on Cloudflare Pages (custom domains work through a
 *   plain CNAME), and a separate small Worker runs the monitor cron, because
 *   Pages Functions can't have cron triggers. Both use the same D1 database.
 *
 * Nitro generates the app's wrangler config from {@link nitroWranglerConfig};
 * the cron Worker's config is written next to the build output by
 * {@link writeCronWorkerConfig}.
 */

export type CloudflareTarget = 'workers' | 'pages';

/** `null` for non-Cloudflare (Bun) builds. Set by the `build:cf*` scripts. */
export function getCloudflareTarget(): CloudflareTarget | null {
	if (process.env.CF_BUILD !== '1') return null;
	return process.env.CF_TARGET === 'pages' ? 'pages' : 'workers';
}

/** Also used as Nuxt's `compatibilityDate`. */
export const COMPATIBILITY_DATE = '2025-07-15';

const APP_NAME = 'leicraftmc-status-page';
const CRON_WORKER_NAME = `${APP_NAME}-cron`;

/** Runs the `check-monitors` scheduled task / the cron Worker. */
const MONITOR_CHECK_CRON = '* * * * *';

/** The cron Worker's generated config (Pages target only). */
export const CRON_WORKER_CONFIG_PATH = 'dist/cron-worker/wrangler.json';

function d1Databases() {
	return [{
		binding: 'DB',
		database_name: APP_NAME,
		// From `wrangler d1 create leicraftmc-status-page`.
		// Only needed for remote (production) access.
		database_id: process.env.CLOUDFLARE_D1_DATABASE_ID || 'local-only',
		// Relative to the generated wrangler config: .output/server/ (Workers),
		// dist/_worker.js/ (Pages) and dist/cron-worker/ are all two levels deep.
		migrations_dir: '../../drizzle/migrations',
	}];
}

/** Runtime configuration, see server/utils/config.ts. */
function vars() {
	return {
		LCCFWSP_LOG_LEVEL: 'info',
		LCCFWSP_API_DISABLE_DOCS: 'false',
		// Migrations run with wrangler on deploy, not on boot.
		LCCFWSP_DB_AUTO_MIGRATE: 'false',
		LCCFWSP_APP_URL: process.env.LCCFWSP_APP_URL || 'http://localhost:8787',
		...(process.env.LCCFWSP_CHECK_RETENTION_DAYS
			? { LCCFWSP_CHECK_RETENTION_DAYS: process.env.LCCFWSP_CHECK_RETENTION_DAYS }
			: {}),
	};
}

/**
 * `nitro.cloudflare.wrangler` for the app. Nitro adds `main`/`assets` (Workers)
 * or `pages_build_output_dir` (Pages), `compatibility_date` and the
 * `nodejs_compat` flag itself.
 */
export function nitroWranglerConfig(target: CloudflareTarget) {
	if (target === 'pages') {
		// Pages projects don't support cron triggers or `observability`; the cron
		// runs in its own Worker (see writeCronWorkerConfig).
		return {
			name: APP_NAME,
			d1_databases: d1Databases(),
			vars: vars(),
		};
	}
	return {
		name: APP_NAME,
		d1_databases: d1Databases(),
		triggers: { crons: [MONITOR_CHECK_CRON] },
		vars: vars(),
		// Keeps logs (e.g. the one-time initial admin reset URL).
		observability: { enabled: true },
	};
}

/**
 * Writes the wrangler config of the cron Worker (server/cron-worker.ts) for
 * the Pages target. Wrangler bundles that entry itself; paths are relative to
 * the written file.
 */
export async function writeCronWorkerConfig(rootDir: string) {
	const config = {
		name: CRON_WORKER_NAME,
		main: '../../server/cron-worker.ts',
		compatibility_date: COMPATIBILITY_DATE,
		compatibility_flags: ['nodejs_compat'],
		// Only runs on its schedule; no public URL.
		workers_dev: false,
		triggers: { crons: [MONITOR_CHECK_CRON] },
		d1_databases: d1Databases(),
		vars: vars(),
		// The Bun-only SQLite driver cannot be bundled for Workers and is never
		// used there (see build/cloudflare-stubs.ts).
		alias: {
			'drizzle-orm/bun-sqlite': '../../server/stubs/bun-sqlite.ts',
			'drizzle-orm/bun-sqlite/migrator': '../../server/stubs/bun-sqlite.ts',
		},
		observability: { enabled: true },
	};

	const path = resolve(rootDir, CRON_WORKER_CONFIG_PATH);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(config, null, 2));
}

