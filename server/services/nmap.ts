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
    async scan(targetHost: string): Promise<NmapResult> {
        try {
            // -T4: Faster timing
            // -F: Fast mode (top 100 ports)
            // -sV: Probe open ports to determine service/version info
            // --version-light: Limit to most likely probes (faster than default)
            // --max-retries 1: Give up on port earlier
            // --host-timeout 5m: Give up on host after 5 minutes
            const command = `nmap -T4 -F -sV --version-light --max-retries 1 --host-timeout 5m -oX - --no-stylesheet ${targetHost}`;

            console.log(`[Nmap] Executing: ${command}`);
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
            console.error(`[Nmap] Scan failed for ${targetHost}:`, error.message);
            // If execution fails, return empty result rather than throwing, 
            // but maybe strict enforcement requires throwing? 
            // USER SAID: "Prevent Nikto or OWASP ZAP from running if httpx or Nmap fails."
            // So I should throw or return status that indicates failure.
            throw error;
        }
    }
}

export const nmapService = new NmapService();
