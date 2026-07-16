import fs from "fs/promises";
import path from "path";
/// <reference types="bun-types" />
import { afterAll, beforeAll } from "bun:test";
import { ConfigHandler, type ParsedConfig } from "../../server/utils/config";
import { DB } from "../../server/db";
import { API } from "../../server/lib/api";

function setTestEnv(rootDir: string) {

    const envVars = {
        LCCFWSP_LOG_LEVEL: "debug",

        LCCFWSP_APP_URL: "http://localhost:12336",

        LCCFWSP_API_DISABLE_DOCS: true,

        LCCFWSP_DB_PATH: path.join(rootDir, "db.sqlite"),
        LCCFWSP_DB_AUTO_MIGRATE: true,

        LCCFWSP_CONFIG_BASE_DIR: rootDir,

    } as const satisfies Partial<ParsedConfig>;

    for (const [key, value] of Object.entries(envVars)) {
        process.env[key] = String(value);
    }
}


async function runCommand(cmd: string[]) {
    const process = Bun.spawn({
        cmd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
        process.stdout ? new Response(process.stdout).text() : Promise.resolve(""),
        process.stderr ? new Response(process.stderr).text() : Promise.resolve(""),
        process.exited,
    ]);

    if (exitCode !== 0) {
        throw new Error(`Command failed: ${cmd.join(" ")}\n${stderr || stdout}`.trim());
    }
}


async function createIsolatedDataDir(): Promise<string> {
    const root = await fs.mkdtemp(path.join(process.cwd(), "tmp-data-"));
    return root;
}

/**
 * On Windows, file handles (e.g. the SQLite DB file) can take a moment to be
 * released after closing, making an immediate recursive removal flaky (EBUSY).
 * Retries manually since Bun's `fs.rm` doesn't reliably honor `maxRetries`/`retryDelay`.
 */
async function removeDirWithRetry(dir: string, attempts = 10, delayMs = 300) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await fs.rm(dir, { recursive: true, force: true });
            return;
        } catch (err: any) {
            if (attempt === attempts || (err?.code !== "EBUSY" && err?.code !== "ENOTEMPTY" && err?.code !== "EPERM")) {
                throw err;
            }
            await Bun.sleep(delayMs);
        }
    }
}


let TMP_ROOT: string | null = null;

beforeAll(async () => {
    TMP_ROOT = await createIsolatedDataDir();

    setTestEnv(TMP_ROOT);

    await DB.init(
        path.join(TMP_ROOT, "db.sqlite"),
        true,
        TMP_ROOT
    );

    await API.init();

});

afterAll(async () => {

    await DB.close();

    if (TMP_ROOT) {
        await removeDirWithRetry(TMP_ROOT);
    }
});
