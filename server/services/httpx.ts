import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface HttpxResult {
    url: string;
    status?: number;
    title?: string;
    webserver?: string;
    tech?: string[];
    reachable: boolean;
}

export class HttpxService {
    async scan(targetUrl: string): Promise<HttpxResult> {
        try {
            // -json: JSON output
            // -tech-detect: Detect technologies
            // -status-code: Include status code
            // -title: Include page title
            // -web-server: Detect web server
            // -silent: Only output results
            // -timeout: Per-request timeout (15 seconds)
            // -retries: Retry failed requests
            const command = `httpx -u ${targetUrl} -json -tech-detect -status-code -title -web-server -silent -timeout 15 -retries 2`;

            console.log(`[Httpx] Executing: ${command}`);
            // Set a 60-second timeout for the entire command (allows for retries)
            const { stdout } = await execAsync(command, { timeout: 60000 });


            if (!stdout.trim()) {
                return { url: targetUrl, reachable: false };
            }

            // httpx outputs one JSON object per line. We expect one line for a single target.
            const result = JSON.parse(stdout.split('\n')[0]);

            return {
                url: result.url,
                status: result.status_code,
                title: result.title,
                webserver: result.webserver,
                tech: result.tech || [],
                reachable: true,
            };

        } catch (error: any) {
            console.error(`[Httpx] Scan failed for ${targetUrl}:`, error.message);
            // If execution fails completely, assume unreachable or tool error
            return { url: targetUrl, reachable: false };
        }
    }
}

export const httpxService = new HttpxService();
