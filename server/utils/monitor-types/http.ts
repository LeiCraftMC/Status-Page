import { DB } from "../../db";
import { MonitorType } from "./monitor-type";

/** Up when a request to the target URL answers with the expected status code. */
export class HttpMonitorType extends MonitorType<"http"> {

    readonly name = "http";

    override readonly ownFields = ["http_method", "expected_http_status"] as const;
    override readonly requiredFields = ["http_method"] as const;

    static readonly DEFAULT_EXPECTED_STATUS = 200;

    protected async probe(monitor: DB.Models.Monitor, timeoutMs: number): Promise<boolean> {
        const response = await fetch(monitor.target, {
            method: monitor.http_method || "GET",
            redirect: monitor.follow_redirects ? "follow" : "manual",
            signal: AbortSignal.timeout(timeoutMs),
        });
        // Only the status matters; release the connection without reading the body.
        await response.body?.cancel();

        return response.status === (monitor.expected_http_status ?? HttpMonitorType.DEFAULT_EXPECTED_STATUS);
    }

}
