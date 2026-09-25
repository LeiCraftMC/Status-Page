import { DB } from "../../db";
import { Runtime } from "../runtime";
import { MonitorType } from "./monitor-type";

/** Up when a TCP connection to the target (`host:port` or `tcp://host:port`) can be opened. */
export class TcpMonitorType extends MonitorType<"tcp"> {

    readonly name = "tcp";

    static readonly DEFAULT_PORT = 80;

    protected async probe(monitor: DB.Models.Monitor, timeoutMs: number): Promise<boolean> {
        const address = TcpMonitorType.parseTarget(monitor.target);
        if (!address) return false;
        return await Runtime.Net.canConnect(address.hostname, address.port, timeoutMs);
    }

    /**
     * Parses `host:port`, `[ipv6]:port` or any `scheme://host:port` URL. The
     * port defaults to {@link TcpMonitorType.DEFAULT_PORT}.
     */
    static parseTarget(target: string): { hostname: string; port: number } | null {
        let url: URL;
        try {
            // Without a scheme, `host:port` would parse as scheme `host:`.
            url = new URL(target.includes("://") ? target : `tcp://${target}`);
        } catch {
            return null;
        }

        // IPv6 hostnames keep their brackets in URL.hostname.
        const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");
        if (!hostname) return null;

        return {
            hostname,
            port: url.port ? Number(url.port) : this.DEFAULT_PORT,
        };
    }

}
