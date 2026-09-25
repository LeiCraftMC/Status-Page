import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { Logger } from "../server/utils/logger";

describe("Logger", () => {
    let previousLevel: Logger.LogLevel;

    beforeEach(() => {
        previousLevel = Logger.getLogLevel();
        Logger.setLogLevel("debug");
    });

    afterEach(() => {
        Logger.setLogLevel(previousLevel);
        delete (globalThis as any).WebSocketPair;
    });

    test("on Bun, prefixes timestamp and level", () => {
        const spy = spyOn(console, "warn").mockImplementation(() => {});
        try {
            Logger.warn("disk", 42);
            const [timestamp, level, ...rest] = spy.mock.calls[0]!;
            expect(timestamp).toMatch(/^\[\d{4}-\d{2}-\d{2}T.*Z\]$/);
            expect(level).toBe("[WARN]");
            expect(rest).toEqual(["disk", 42]);
        } finally {
            spy.mockRestore();
        }
    });

    test("on Cloudflare, logs one structured object via the matching console method", () => {
        (globalThis as any).WebSocketPair = class {};
        const info = spyOn(console, "info").mockImplementation(() => {});
        const error = spyOn(console, "error").mockImplementation(() => {});
        try {
            Logger.info("Checked", 3, "monitors", { slow: true });
            expect(info.mock.calls[0]).toEqual([{ message: 'Checked 3 monitors {"slow":true}', level: "info" }]);

            const err = new TypeError("boom");
            Logger.critical("API Error:", err);
            const [entry] = error.mock.calls[0]! as [Logger.StructuredEntry];
            expect(entry.level).toBe("critical");
            expect(entry.message).toBe("API Error: TypeError: boom");
            expect(entry.error?.[0]).toMatchObject({ name: "TypeError", message: "boom" });
            expect(entry.error?.[0]?.stack).toContain("boom");
        } finally {
            info.mockRestore();
            error.mockRestore();
        }
    });

    test("respects the log level", () => {
        const spy = spyOn(console, "debug").mockImplementation(() => {});
        try {
            Logger.setLogLevel("info");
            Logger.debug("hidden");
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });

    test("formats values that JSON can't represent", () => {
        const circular: any = { a: 1 };
        circular.self = circular;
        const entry = Logger.toStructuredEntry("info", [undefined, 10n, circular]);
        expect(entry.message).toBe("undefined 10 [object Object]");
    });
});
