import { DB } from "../../db";

/**
 * A kind of monitor (HTTP, TCP, …): how its target is checked and which of the
 * type-specific monitor columns it uses.
 *
 * Subclasses implement {@link MonitorType.probe}; timing, the timeout and
 * turning errors into a `down` result are handled here. Register new types
 * in {@link MonitorTypes} (and add their name to the `type` enum of the
 * monitors table).
 */
export abstract class MonitorType<NAME extends MonitorType.TypeName = MonitorType.TypeName> {

    abstract readonly name: NAME;

    /**
     * Nullable monitor columns that only this type uses. Other types must leave
     * them empty; they are cleared when a monitor changes to another type.
     */
    readonly ownFields: readonly MonitorType.TypeSpecificField[] = [];

    /** Columns that must be set when creating a monitor of this type (or changing to it). */
    readonly requiredFields: readonly MonitorType.TypeSpecificField[] = [];

    /** Runs one check against the monitor's target. Never throws. */
    async check(monitor: DB.Models.Monitor): Promise<MonitorType.CheckResult> {
        const start = Date.now();
        let isUp = false;
        try {
            isUp = await this.probe(monitor, (monitor.timeout_seconds ?? 10) * 1000);
        } catch {
            // Unreachable, timed out or invalid target: all count as down.
        }
        return {
            status: isUp ? "up" : "down",
            response_time_ms: Date.now() - start,
        };
    }

    /**
     * Checks the target once.
     *
     * @returns whether the target is up. Throwing counts as down.
     */
    protected abstract probe(monitor: DB.Models.Monitor, timeoutMs: number): Promise<boolean>;

}

export namespace MonitorType {

    export type TypeName = DB.Models.Monitor["type"];

    export type TypeSpecificField = "http_method" | "expected_http_status";

    export interface CheckResult {
        status: "up" | "down";
        response_time_ms: number | null;
    }

}
