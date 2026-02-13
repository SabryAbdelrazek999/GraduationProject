import { exec } from "child_process";
import { promisify } from "util";
import { parseStringPromise } from "xml2js";

const execAsync = promisify(exec);

export interface NmapPort {
    port: number;
    protocol: string;
    state: string;
    service: string;
}

export interface NmapResult {
    host: string;
    openPorts: NmapPort[];
    rawOutput: string;
}

export class NmapService {
    async scan(targetHost: string, scanDepth: string = "medium"): Promise<NmapResult> {
        try {
            let command: string;
            
            // Configure based on scan depth
            if (scanDepth === "shallow") {
                // Shallow: Skip Nmap entirely (will be handled by caller)
                throw new Error("Nmap skipped in shallow mode");
            } else if (scanDepth === "deep") {
                // Deep: Scan top 1000 ports (comprehensive)
                // --top-ports 1000: Scan most common 1000 ports
                command = `nmap -T4 --top-ports 1000 -sV --version-light --max-retries 1 --host-timeout 10m -oX - --no-stylesheet ${targetHost}`;
            } else {
                // Medium (default): Fast mode - top 100 ports
                // -F: Fast mode (top 100 ports)
                command = `nmap -T4 -F -sV --version-light --max-retries 1 --host-timeout 5m -oX - --no-stylesheet ${targetHost}`;
            }

            console.log(`[Nmap] Executing (${scanDepth} mode): ${command}`);
            const { stdout } = await execAsync(command, {
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            const parsed = await parseStringPromise(stdout);
            const ports: NmapPort[] = [];

            if (parsed?.nmaprun?.host?.[0]?.ports?.[0]?.port) {
                const portList = parsed.nmaprun.host[0].ports[0].port;

                for (const p of portList) {
                    const state = p.state?.[0]?.$?.state;
                    if (state === 'open') {
                        ports.push({
                            port: parseInt(p.$.portid),
                            protocol: p.$.protocol,
                            state: state,
                            service: p.service?.[0]?.$?.name || 'unknown'
                        });
                    }
                }
            }

            return {
                host: targetHost,
                openPorts: ports,
                rawOutput: stdout
            };

        } catch (error: any) {
           console.error("[Nmap] Scan failed", {target: targetHost,error: error.message});
            throw error;
        }
    }
}

export const nmapService = new NmapService();
