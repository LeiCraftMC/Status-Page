import { resolve } from 'node:path';
import type { Plugin } from 'rollup';

/**
 * Rollup plugin for the Cloudflare Workers build (enabled by `CF_BUILD=1` in
 * nuxt.config.ts). Workers bundle every import at build time, so imports that
 * the Bun build never loads at runtime still have to resolve. This replaces
 * them with stub modules:
 *
 * - `drizzle-orm/bun-sqlite` (+ `/migrator`): statically imports `bun:sqlite`,
 *   which cannot be bundled for Workers. `DB.init()` only uses it on Bun.
 *
 * - Schema-library "vendors" of `@standard-community/standard-json` and
 *   `standard-openapi` (used by hono-openapi for the OpenAPI docs). They
 *   contain `await import('effect')`, `import('sury')`, … for every schema
 *   library they support. Those are optional peers: normally not installed
 *   (so the build fails) or, if present, bundled for nothing (`effect` alone
 *   is several MB). This app only uses zod v4, so everything else is stubbed.
 *   Matching every non-zod import — instead of listing packages — keeps the
 *   build working when a new version adds another vendor.
 */
export function cloudflareBuildStubs(): Plugin {
	const bunSqliteStub = resolve('./server/stubs/bun-sqlite.ts');
	const schemaVendorStub = resolve('./server/stubs/schema-vendors.ts');

	// Imports the standard-community packages need for zod v4 and themselves.
	const allowedFromSchemaPackages = /^(zod(\/|$)|quansync$|@standard-community\/)/;

	return {
		name: 'cloudflare-build-stubs',
		resolveId: {
			// Run before node-resolve, so installed-but-unused vendors are stubbed too.
			order: 'pre',
			handler(source, importer) {
				if (source === 'drizzle-orm/bun-sqlite' || source === 'drizzle-orm/bun-sqlite/migrator') {
					return bunSqliteStub;
				}

				const isBareImport = !source.startsWith('.') && !source.startsWith('/') && !source.startsWith('\0');
				if (
					isBareImport &&
					importer?.includes('/node_modules/@standard-community/') &&
					!allowedFromSchemaPackages.test(source)
				) {
					return schemaVendorStub;
				}

				return null;
			},
		},
	};
}
