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

async function createIsolatedDataDir(): Promise<string> {
    const root = await fs.mkdtemp(path.join(process.cwd(), "tmp-data-"));
    return root;
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
        // On Windows, SQLite may hold a file lock preventing fs.rm.
        // Fall back to PowerShell for resilient cleanup.
        try {
            await fs.rm(TMP_ROOT, { recursive: true, force: true });
        } catch {
            await Bun.sleep(200);
            Bun.spawnSync(["powershell", "-Command",
                `Remove-Item -Path '${TMP_ROOT.replace(/'/g, "''")}' -Recurse -Force`],
                { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
        }
    }
});
