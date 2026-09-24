/**
 * Build-time stub that replaces `drizzle-orm/bun-sqlite` (and its `/migrator`
 * subpath) during Cloudflare builds.  Swapped in through `nitro.alias` in
 * `nuxt.config.ts` when `CF_BUILD=1` is set.
 *
 * The real module statically imports `bun:sqlite`, which cannot be resolved in
 * a Cloudflare Workers bundle.  Nothing here is ever called on Workers:
 * `DB.init()` only takes the bun-sqlite branch when `Runtime.isBun` is true.
 */

export function drizzle(...args: never[]): never {
	throw new Error('[DB] drizzle-orm/bun-sqlite is not available on Cloudflare Workers.');
}

export async function migrate(...args: never[]): Promise<never> {
	throw new Error('[DB] drizzle-orm/bun-sqlite migrator is not available on Cloudflare Workers.');
}