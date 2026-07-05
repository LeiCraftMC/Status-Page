import { defineNitroPlugin } from 'nitropack/runtime'
import { ConfigHandler } from '../utils/config'
import { Logger } from '../utils/logger'
import { DB } from '../db'
import { API } from '../lib/api'

export default defineNitroPlugin(async (nitroApp) => {

	const config = await ConfigHandler.loadConfig()

	Logger.setLogLevel(config.LCCFWSP_LOG_LEVEL ?? 'info')

	await DB.init(
		config.LCCFWSP_DB_PATH ?? './data/db.sqlite',
		config.LCCFWSP_DB_AUTO_MIGRATE,
	)

	await API.init(config.LCCFWSP_API_DISABLE_DOCS === true)
});
