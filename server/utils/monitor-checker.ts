import { DB } from "../db";
import { Runtime } from './runtime';
import { Logger } from './logger';

export interface CheckResult {
    status: "up" | "down";
    response_time_ms: number | null;
}

/** Types for the cloudflare:sockets built-in module (Workers-only). */
interface SocketAddress {
    hostname: string;
    port: number;
}
interface Socket {
    readonly opened: Promise<unknown>;
    readonly closed: Promise<void>;
    close(): Promise<void>;
}

interface CfSocketsModule {
    connect(address: string | SocketAddress, options?: unknown): Socket;
}

async function tcpCheck(hostname: string, port: number, timeoutMs: number): Promise<boolean> {
    if (Runtime.isCloudflare) {
        // @ts-expect-error — cloudflare:sockets is a Workers built-in, not an npm package
        const mod: CfSocketsModule = await import("cloudflare:sockets");
        const socket = mod.connect({ hostname, port });
        try {
            await Promise.race([
                socket.opened,
                new Promise<void>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
            ]);
            return true;
        } catch {
            return false;
        } finally {
            try {
                await socket.close();
            } catch {
                // ignore close errors
            }
        }
    }

    // Bun / Node fallback
    if (Runtime.isBun) {
        try {
            await Bun.connect({ hostname, port } as any);
            return true;
        } catch {
            return false;
        }
    }

    // Node.js does not expose a builtin one-liner TCP connection helper.
    // Return unknown/down so we don't break, but log a warning.
    Logger.warn(`[Runtime] TCP check is not implemented for runtime "${Runtime.name}"`);
    return false;
}

export async function performMonitorCheck(monitor: DB.Models.Monitor): Promise<CheckResult> {
    const start = Date.now();
    try {
        if (monitor.type === "http") {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), (monitor.timeout_seconds ?? 10) * 1000);

            const response = await fetch(monitor.target, {
                method: monitor.http_method || "GET",
                redirect: monitor.follow_redirects ? "follow" : "manual",
                signal: controller.signal,
            });

            clearTimeout(timeout);
            const elapsed = Date.now() - start;

            const expected = monitor.expected_http_status ?? 200;
            const status = response.status === expected ? "up" : "down";

            return { status, response_time_ms: elapsed };
        }

        // TCP: parse hostname and port from target
        let hostname = "";
        let port = 80;

        try {
            const url = new URL(monitor.target);
            hostname = url.hostname;
            port = url.port ? parseInt(url.port, 10) : 80;
        } catch {
            const parts = monitor.target.split(":");
            hostname = parts[0] || "";
            port = parts[1] ? parseInt(parts[1], 10) : 80;
        }

        if (!hostname) {
            return { status: "down", response_time_ms: Date.now() - start };
        }

        const connected = await tcpCheck(hostname, port, (monitor.timeout_seconds ?? 10) * 1000);
        return {
            status: connected ? "up" : "down",
            response_time_ms: Date.now() - start,
        };
    } catch {
        return { status: "down", response_time_ms: Date.now() - start };
    }
}
