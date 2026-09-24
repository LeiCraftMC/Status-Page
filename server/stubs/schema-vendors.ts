/**
 * Build-time stubs for the schema-library "vendors" that
 * `@standard-community/standard-json` lazy-imports
 * (`await import('effect')` etc.).  In the single-file Workers bundle every
 * dynamic import target gets inlined, and `effect` alone drags in
 * `fast-check` + `pure-rand` — far too much for the worker size limit.
 *
 * This app only uses **zod v4** schemas, so these vendor code paths are never
 * selected at runtime.  Every non-zod import of those packages resolves here
 * (see `build/cloudflare-stubs.ts`); the named exports below just make the
 * known ones fail with a clear message if they were ever reached.
 */

/** effect: `JSONSchema` */
export function JSONSchema(...args: never[]): never {
	throw missingVendor('effect');
}

/** sury: `toJSONSchema` */
export function toJSONSchema(...args: never[]): never {
	throw missingVendor('sury');
}

/** zod-to-json-schema: only used for zod v3 schemas; this app uses zod v4 */
export function zodToJsonSchema(...args: never[]): never {
	throw missingVendor('zod-to-json-schema');
}

/** zod-openapi: only used for zod v3 schemas; this app uses zod v4 */
export function createSchema(...args: never[]): never {
	throw missingVendor('zod-openapi');
}

/** @valibot/to-json-schema: `toJsonSchema` */
export function toJsonSchema(...args: never[]): never {
	throw missingVendor('@valibot/to-json-schema');
}

function missingVendor(vendor: string): Error {
	return new Error(
		`The "${vendor}" schema vendor is not bundled in the Cloudflare build of this app. ` +
		`Only zod schemas are supported here.`
	);
}