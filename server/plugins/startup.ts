import { defineNitroPlugin } from 'nitropack/runtime'
import { ConfigHandler } from '../utils/config'
import { Logger } from '../utils/logger'
import { DB } from '../db'
import { API } from '../lib/api'
import { Runtime } from '../utils/runtime'
import { MonitorStats } from '../utils/monitor-stats'
import type { D1Database } from '@cloudflare/workers-types'

async function initialize() {

	const config = await ConfigHandler.loadConfig()

	Logger.setLogLevel(config.LCCFWSP_LOG_LEVEL ?? 'info')

	let dbConfig: D1Database | string
	if (Runtime.isCloudflare) {
		// On Workers the database is the D1 binding named `DB` (nitro.cloudflare.wrangler in nuxt.config.ts).
		const bindings = Runtime.getWorkerBindings() as { DB?: D1Database }
		if (!bindings.DB) {
			throw new Error('D1 binding "DB" not found — check nitro.cloudflare.wrangler.d1_databases in nuxt.config.ts.')
		}
		dbConfig = bindings.DB
	} else {
		dbConfig = config.LCCFWSP_DB_PATH ?? './data/db.sqlite'
	}

	await DB.init(
		dbConfig,
		config.LCCFWSP_DB_AUTO_MIGRATE,
		config.LCCFWSP_CONFIG_BASE_DIR
	)

	if (!Runtime.isCloudflare) {
		// Installations upgraded from a version without daily aggregates get them
		// built once from their raw checks. Skipped on Workers: a D1 database is
		// always created with the aggregate table, and a large backfill would not
		// fit in a request's CPU budget.
		const backfilled = await MonitorStats.backfillDailyStatsIfEmpty()
		if (backfilled > 0) {
			Logger.info(`Built daily monitor statistics from ${backfilled} existing status checks.`)
		}
	}

	await API.init(config.LCCFWSP_API_DISABLE_DOCS === true)
}

export default defineNitroPlugin(async (nitroApp) => {

	if (Runtime.isCloudflare) {
		// Nitro plugins run while the worker module is loading, where Workers
		// forbid I/O and random values (D1 queries, token generation). Initialize
		// once, on the first request, instead. A failed init is retried on the
		// next request.
		let ready: Promise<void> | undefined
		nitroApp.hooks.hook('request', () => {
			ready ??= initialize().catch((err) => {
				ready = undefined
				throw err
			})
			return ready
		})
		return
	}

	await initialize()
});
