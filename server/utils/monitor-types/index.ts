import { DB } from "../../db";
import { HttpMonitorType } from "./http";
import { MonitorType } from "./monitor-type";
import { TcpMonitorType } from "./tcp";

/**
 * Registry of all monitor types. Adding a type: subclass {@link MonitorType},
 * add its name to the `type` enum of the monitors table and register it below.
 */
export class MonitorTypes {

    protected constructor() {}

    /** Typed over the table's enum, so an unregistered type fails to compile. */
    private static readonly registry: { readonly [NAME in MonitorType.TypeName]: MonitorType<NAME> } = {
        http: new HttpMonitorType(),
        tcp: new TcpMonitorType(),
    };

    static get names(): MonitorType.TypeName[] {
        return Object.keys(this.registry) as MonitorType.TypeName[];
    }

    static get(name: MonitorType.TypeName): MonitorType {
        const type = this.registry[name];
        if (!type) {
            throw new Error(`Unknown monitor type: "${name}"`);
        }
        return type;
    }

    /** Runs one check of the monitor with its type's checker. Never throws. */
    static check(monitor: DB.Models.Monitor): Promise<MonitorType.CheckResult> {
        return this.get(monitor.type).check(monitor);
    }

    /**
     * Problems with the type-specific fields of a monitor of type `name`:
     * required fields that are missing and fields of other types that are set.
     */
    static validateFields(name: MonitorType.TypeName, values: MonitorTypes.FieldValues): string[] {
        const type = this.get(name);
        const issues: string[] = [];

        for (const field of type.requiredFields) {
            if (values[field] == null) {
                issues.push(`${name.toUpperCase()} monitors require ${field}`);
            }
        }
        for (const field of this.foreignFields(type)) {
            if (values[field] != null) {
                issues.push(`${name.toUpperCase()} monitors must not include ${field}`);
            }
        }

        return issues;
    }

    /**
     * `null` for every field of the other types, to store alongside a monitor
     * of type `name` so that no stale values of a previous type remain.
     */
    static clearedForeignFields(name: MonitorType.TypeName): Partial<Record<MonitorType.TypeSpecificField, null>> {
        return Object.fromEntries(this.foreignFields(this.get(name)).map((field) => [field, null]));
    }

    private static foreignFields(type: MonitorType): MonitorType.TypeSpecificField[] {
        const foreign = new Set(Object.values(this.registry).flatMap((other) => other.ownFields));
        for (const field of type.ownFields) foreign.delete(field);
        return [...foreign];
    }

}

export namespace MonitorTypes {
    export type FieldValues = Partial<Record<MonitorType.TypeSpecificField, unknown>>;
}
