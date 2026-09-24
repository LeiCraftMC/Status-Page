import type { MiddlewareHandler } from "hono";
import { Runtime } from "../../../utils/runtime";

/**
 * Short-lived in-memory cache for the public (unauthenticated) API.
 *
 * Only active on Cloudflare Workers, where every public page view otherwise
 * costs D1 row reads and CPU time against the plan limits, and where one
 * isolate serves many visitors. Entries live in the isolate's memory, so they
 * work on workers.dev too (the Cache API does not). Changes become visible on
 * public pages after at most `ttlSeconds`.
 *
 * Only for routes whose response depends on nothing but the URL — never put it
 * in front of authenticated routes.
 */
export function publicResponseCache(ttlSeconds: number): MiddlewareHandler {
    return async (c, next) => {
        if (!Runtime.isCloudflare || c.req.method !== "GET") {
            return next();
        }

        const url = new URL(c.req.url);
        const key = url.pathname + url.search;

        const hit = PublicResponseCache.get(key);
        if (hit) {
            return new Response(hit.body, { status: hit.status, headers: hit.headers });
        }

        await next();

        if (c.res.status === 200) {
            PublicResponseCache.set(key, {
                status: c.res.status,
                headers: [...c.res.headers.entries()],
                body: await c.res.clone().text(),
            }, ttlSeconds);
        }
    };
}

export namespace PublicResponseCache {

    export interface Entry {
        status: number;
        headers: [string, string][];
        body: string;
    }

    /** Upper bound on cached URLs (query parameters like `days` vary the key). */
    const MAX_ENTRIES = 200;

    const entries = new Map<string, Entry & { expiresAt: number }>();

    export function get(key: string): Entry | undefined {
        const entry = entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= Date.now()) {
            entries.delete(key);
            return undefined;
        }
        return entry;
    }

    export function set(key: string, entry: Entry, ttlSeconds: number) {
        entries.delete(key);
        if (entries.size >= MAX_ENTRIES) {
            // Maps iterate in insertion order: drop the oldest entry.
            entries.delete(entries.keys().next().value!);
        }
        entries.set(key, { ...entry, expiresAt: Date.now() + ttlSeconds * 1000 });
    }

    export function clear() {
        entries.clear();
    }
}
