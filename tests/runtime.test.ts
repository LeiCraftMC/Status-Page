/**
 * Tests for the runtime abstraction layer.
 *
 * These tests intentionally exercise the wrappers directly rather than mocking
 * runtimes, because every current supported runtime (Bun, Node, CF Workers-ish)
 * implements the APIs we rely on (Web Crypto, `crypto.randomUUID`, timers, fetch).
 * The runtime detection test adapts its expectation to whichever environment is
 * actually executing.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { Runtime } from "../server/utils/runtime";

describe("Runtime detection", () => {

    test("detects a known runtime", () => {
        expect(["bun", "cloudflare", "node", "unknown"]).toContain(Runtime.name);
    });

    test("runtime flags are mutually exclusive-ish", () => {
        const flags = [Runtime.isBun, Runtime.isCloudflare].filter(Boolean).length;
        // Bun reports itself as node-ish in some detection strategies, but the
        // implementation currently distinguishes Bun before Node. At most one flag
        // should be true for a clean environment.
        expect(flags).toBeLessThanOrEqual(1);
    });

    test("name accessor matches flags", () => {
        const expected = Runtime.isBun
            ? "bun"
            : Runtime.isCloudflare
                ? "cloudflare"
                : "unknown";

        if (expected !== "unknown") {
            expect(Runtime.name).toBe(expected);
        } else {
            throw new Error("Runtime is unknown; cannot assert name matches flags");
        }
    });

});

describe("Crypto helpers", () => {

    test("randomBytes produces requested length", () => {
        expect(Runtime.Crypto.randomBytes(16).length).toBe(16);
        expect(Runtime.Crypto.randomBytes(32).length).toBe(32);
        expect(Runtime.Crypto.randomBytes(0).length).toBe(0);
    });

    test("randomBytes values differ between calls", () => {
        const a = Runtime.Crypto.randomBytes(16);
        const b = Runtime.Crypto.randomBytes(16);
        // Collisions are theoretically possible but statistically negligible.
        expect(a).not.toEqual(b);
    });

    test("randomBytesHex returns correct length", () => {
        expect(Runtime.Crypto.randomBytesHex(16).length).toBe(32);
        expect(Runtime.Crypto.randomBytesHex(64).length).toBe(128);
        expect(/^[a-f0-9]+$/i.test(Runtime.Crypto.randomBytesHex(64))).toBe(true);
    });

    test("sha256 produces a 64-character hex string", async () => {
        const hash = await Runtime.Crypto.sha256("hello world");
        expect(hash.length).toBe(64);
        expect(/^[a-f0-9]+$/i.test(hash)).toBe(true);
    });

    test("sha256 is deterministic", async () => {
        const a = await Runtime.Crypto.sha256("abc");
        const b = await Runtime.Crypto.sha256("abc");
        expect(a).toBe(b);
    });

    test("sha256 differs for different inputs", async () => {
        const a = await Runtime.Crypto.sha256("abc");
        const b = await Runtime.Crypto.sha256("def");
        expect(a).not.toBe(b);
    });

    test("randomUUID returns a valid UUID v4 string", () => {
        const uuid = Runtime.Crypto.randomUUID();
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

});

describe("Password helpers", () => {

    test("hashPassword returns a non-empty string", async () => {
        const hash = await Runtime.Password.hashPassword("ValidPass1!");
        expect(typeof hash).toBe("string");
        expect(hash.length).toBeGreaterThan(0);
    });

    test("verifyPassword succeeds for the correct password", async () => {
        const hash = await Runtime.Password.hashPassword("CorrectHorseBatteryStaple!2");
        expect(await Runtime.Password.verifyPassword("CorrectHorseBatteryStaple!2", hash)).toBe(true);
    });

    test("verifyPassword fails for the wrong password", async () => {
        const hash = await Runtime.Password.hashPassword("CorrectHorseBatteryStaple!2");
        expect(await Runtime.Password.verifyPassword("WrongPassword!1", hash)).toBe(false);
    });

    test("verifyPassword fails for an unknown hash format", async () => {
        expect(await Runtime.Password.verifyPassword("anything", "$not-a-real-format$123")).toBe(false);
    });

    test("cross-runtime interop: can verify a Web Crypto PBKDF2 hash from a fake runtime", async () => {
        // If we are on Bun, the library delegates to Bun.password. To test the
        // Web Crypto path explicitly we import the implementation module directly.
        // This is the only place where we reach past the public API.
        const hash = await Runtime.Password.__testWebCryptoHashPassword("SomePass123!");
        expect(hash.startsWith("$pbkdf2-sha256$")).toBe(true);
        expect(await Runtime.Password.__testWebCryptoVerifyPassword("SomePass123!", hash)).toBe(true);
        expect(await Runtime.Password.__testWebCryptoVerifyPassword("DifferentPass", hash)).toBe(false);
    });

});

describe("Timer helpers", () => {

    test("sleep waits at least the requested duration", async () => {
        const start = Date.now();
        await Runtime.Timers.sleep(75);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(70);
    });

    test("sleep with 0 resolves quickly", async () => {
        const start = Date.now();
        await Runtime.Timers.sleep(0);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(50);
    });

});

describe("Filesystem helpers", () => {

    test("writeTextFile writes a file on Bun/Node", async () => {
        const { mkdtemp, rm, readFile } = await import("fs/promises");
        const { tmpdir } = await import("os");
        const { join } = await import("path");

        const dir = await mkdtemp(join(tmpdir(), "runtime-test-"));
        const file = join(dir, "test.txt");
        const content = "runtime test content";

        await Runtime.FS.ensureDirectoryExists(dir);

        const written = await Runtime.FS.writeFile(file, content);
        const read = await Runtime.FS.readFile(file, "utf8");

        expect(read).toBe(content);

        await rm(dir, { recursive: true, force: true });
    });

});
