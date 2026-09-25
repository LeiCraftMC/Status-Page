export class Logger {

    private static readonly logLevelMap = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
        critical: 4,
    } as const;

    private static logLevel: typeof this.logLevelMap[Logger.LogLevel] = this.logLevelMap.info;

    static setLogLevel(level: Logger.LogLevel) {
        if (this.logLevelMap[level] === undefined) {
            throw new Error(`Invalid log level: ${level}`);
        }
        this.logLevel = this.logLevelMap[level];
    }

    static getLogLevel(): Logger.LogLevel {
        const match = Object.entries(this.logLevelMap).find(([_, value]) => value === this.logLevel);
        return (match ? match[0] : "info") as Logger.LogLevel;
    }

    static debug(...args: any[]) {
        this.write("debug", "debug", args);
    }

    static log(...args: any[]) {
        this.write("info", "log", args);
    }

    static info(...args: any[]) {
        this.write("info", "info", args);
    }

    static warn(...args: any[]) {
        this.write("warn", "warn", args);
    }

    static error(...args: any[]) {
        this.write("error", "error", args);
    }

    static critical(...args: any[]) {
        this.write("critical", "error", args);
    }

    private static write(level: Logger.LogLevel, method: "debug" | "log" | "info" | "warn" | "error", args: any[]) {
        if (this.logLevel > this.logLevelMap[level]) return;

        if (isCloudflare()) {
            // Workers Logs / Pages logs take the level from the console method
            // and the timestamp from the invocation, and index the fields of a
            // logged object. Passing one object keeps a message on one entry.
            console[method](Logger.toStructuredEntry(level, args));
            return;
        }

        console[method](`[${new Date(Date.now()).toISOString()}]`, `[${level.toUpperCase()}]`, ...args);
    }

    /** One structured log entry: the arguments joined into `message`, errors kept with their stack. */
    static toStructuredEntry(level: Logger.LogLevel, args: any[]): Logger.StructuredEntry {
        const errors = args.filter((arg): arg is Error => arg instanceof Error);
        return {
            message: args.map(formatArg).join(" "),
            level,
            ...(errors.length > 0 ? {
                error: errors.map((err) => ({ name: err.name, message: err.message, stack: err.stack })),
            } : {}),
        };
    }

}

export namespace Logger {
    export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

    export interface StructuredEntry {
        message: string;
        level: LogLevel;
        error?: { name: string; message: string; stack?: string }[];
    }
}

/**
 * Same check as `Runtime.isCloudflare` (runtime.ts imports this module, so it
 * is not imported here to avoid a cycle).
 */
function isCloudflare(): boolean {
    return typeof (globalThis as any).WebSocketPair !== "undefined";
}

function formatArg(arg: unknown): string {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    if (arg === undefined) return "undefined";
    if (typeof arg === "bigint" || typeof arg === "symbol" || typeof arg === "function") return String(arg);
    try {
        return JSON.stringify(arg) ?? String(arg);
    } catch {
        // e.g. circular structures
        return String(arg);
    }
}
