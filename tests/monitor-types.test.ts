import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DB } from "../server/db";
import { MonitorTypes } from "../server/utils/monitor-types";
import { TcpMonitorType } from "../server/utils/monitor-types/tcp";

function monitor(overrides: Partial<DB.Models.Monitor>): DB.Models.Monitor {
    return {
        id: 1,
        name: "Test",
        type: "http",
        target: "",
        interval_seconds: 60,
        timeout_seconds: 2,
        http_method: "GET",
        expected_http_status: 200,
        follow_redirects: true,
        verify_tls: true,
        is_enabled: true,
        is_paused: false,
        created_at: Date.now(),
        ...overrides,
    };
}

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
    server = Bun.serve({
        port: 0,
        fetch: (req) => new Response("ok", { status: new URL(req.url).pathname === "/missing" ? 404 : 200 }),
    });
});

afterAll(() => {
    server.stop(true);
});

describe("TcpMonitorType.parseTarget", () => {

    test("parses host:port", () => {
        expect(TcpMonitorType.parseTarget("example.com:25")).toEqual({ hostname: "example.com", port: 25 });
    });

    test("parses URLs with a scheme", () => {
        expect(TcpMonitorType.parseTarget("tcp://example.com:5432")).toEqual({ hostname: "example.com", port: 5432 });
    });

    test("parses bracketed IPv6 addresses", () => {
        expect(TcpMonitorType.parseTarget("[::1]:8080")).toEqual({ hostname: "::1", port: 8080 });
    });

    test("defaults the port", () => {
        expect(TcpMonitorType.parseTarget("example.com")).toEqual({ hostname: "example.com", port: TcpMonitorType.DEFAULT_PORT });
    });

    test("rejects targets without a host", () => {
        expect(TcpMonitorType.parseTarget("")).toBeNull();
        expect(TcpMonitorType.parseTarget("tcp://:80")).toBeNull();
    });

});

describe("MonitorTypes.validateFields", () => {

    test("HTTP monitors require http_method", () => {
        expect(MonitorTypes.validateFields("http", {})).toHaveLength(1);
        expect(MonitorTypes.validateFields("http", { http_method: "GET" })).toEqual([]);
    });

    test("TCP monitors must not set HTTP fields", () => {
        expect(MonitorTypes.validateFields("tcp", { http_method: "GET", expected_http_status: 200 })).toHaveLength(2);
        expect(MonitorTypes.validateFields("tcp", { http_method: null })).toEqual([]);
    });

    test("clearedForeignFields nulls the fields of other types", () => {
        expect(MonitorTypes.clearedForeignFields("tcp")).toEqual({ http_method: null, expected_http_status: null });
        expect(MonitorTypes.clearedForeignFields("http")).toEqual({});
    });

});

describe("MonitorTypes.check", () => {

    test("HTTP is up when the expected status is returned", async () => {
        const result = await MonitorTypes.check(monitor({ type: "http", target: `http://localhost:${server.port}/` }));
        expect(result.status).toBe("up");
        expect(result.response_time_ms).toBeGreaterThanOrEqual(0);
    });

    test("HTTP is down on an unexpected status", async () => {
        const result = await MonitorTypes.check(monitor({ type: "http", target: `http://localhost:${server.port}/missing` }));
        expect(result.status).toBe("down");
    });

    test("HTTP is down when the target is unreachable", async () => {
        const result = await MonitorTypes.check(monitor({ type: "http", target: "http://localhost:1/" }));
        expect(result.status).toBe("down");
    });

    test("TCP is up when the port accepts connections", async () => {
        const result = await MonitorTypes.check(monitor({ type: "tcp", target: `localhost:${server.port}`, http_method: null }));
        expect(result.status).toBe("up");
    });

    test("TCP is down when the port is closed", async () => {
        const result = await MonitorTypes.check(monitor({ type: "tcp", target: "localhost:1", http_method: null }));
        expect(result.status).toBe("down");
    });

});
