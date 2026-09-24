/**
 * Build-time stubs for the schema-library "vendors" that
 * `@standard-community/standard-json` lazy-imports
 * (`await import('effect')` etc.).  In the single-file Workers bundle every
 * dynamic import target gets inlined, and `effect` alone drags in
 * `fast-check` + `pure-rand` — far too much for the worker size limit.
 *
 * This app only uses **zod** schemas, so these vendor code paths are never
 * selected at runtime.  Swapped in through `nitro.alias` in `nuxt.config.ts`
 * when `CF_BUILD=1` is set.
 */

/** effect: `JSONSchema` */
export function JSONSchema(...args: never[]): never {
	throw missingVendor('effect');
}

/** sury: `toJSONSchema` */
export function toJSONSchema(...args: never[]): never {
	throw missingVendor('sury');
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