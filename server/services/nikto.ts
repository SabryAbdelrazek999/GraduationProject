import { exec } from "child_process";
import { promisify } from "util";
import { parseStringPromise } from "xml2js";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export interface NiktoVulnerability {
    id: string;
    msg: string;
    uri: string;
    method: string;
}

export interface NiktoResult {
    target: string;
    vulnerabilities: NiktoVulnerability[];
    startTime: string;
    endTime: string;
}

export class NiktoService {
    async scan(targetUrl: string, scanDepth: string = "medium"): Promise<NiktoResult> {
        // Use OS-appropriate temp directory (cross-platform compatibility)
        const tempFile = path.join(os.tmpdir(), `nikto-${Date.now()}.xml`);

        try {
            let command: string;
            
            // Configure based on scan depth
            if (scanDepth === "shallow") {
                // Shallow: Skip Nikto entirely (will be handled by caller)
                throw new Error("Nikto skipped in shallow mode");
            } else if (scanDepth === "deep") {
                // Deep: Full comprehensive scan (no time limit, but still skip slow tests)
                // -Tuning x6: Skip reverse lookup and DoS tests
                command = `nikto -h ${targetUrl} -Format xml -o ${tempFile} -Tuning x6 -nointeractive -ask no`;
            } else {
                // Medium (default): Limited 30 second scan
                command = `nikto -h ${targetUrl} -Format xml -o ${tempFile} -maxtime 30s -Tuning x6 -nointeractive -ask no`;
            }

            console.log(`[Nikto] Executing (${scanDepth} mode): ${command}`);
            console.log(`[Nikto] Output file: ${tempFile}`);

            try {
                const timeout = scanDepth === "deep" ? 300000 : 45000; // 5 min for deep, 45s for medium
                const { stdout, stderr } = await execAsync(command, {
                    maxBuffer: 1024 * 1024 * 20,
                    timeout
                });
                if (stderr) console.log(`[Nikto] stderr: ${stderr}`);
                if (stdout) console.log(`[Nikto] stdout: ${stdout.substring(0, 200)}...`);
            } catch (e: any) {
                console.log(`[Nikto] Process exited with error (may be normal): ${e.message}`);
            }

            // Read output file
            let xmlContent: string;
            try {
                xmlContent = await fs.readFile(tempFile, 'utf-8');
                console.log(`[Nikto] Output file read successfully (${xmlContent.length} bytes)`);
            } catch (readErr: any) {
                console.warn(`[Nikto] Cannot read output file: ${readErr.message} - Returning empty results`);
                // Return empty results instead of throwing - Nikto is optional
                return {
                    target: targetUrl,
                    vulnerabilities: [],
                    startTime: new Date().toISOString(),
                    endTime: new Date().toISOString()
                };
            }


            const parsed = await parseStringPromise(xmlContent);
            const vulnerabilities: NiktoVulnerability[] = [];

            if (parsed?.niktoscan?.scandetails) {
                const details = parsed.niktoscan.scandetails;
                // Handle array of scandetails? usually one per host
                for (const scan of details) {
                    if (scan.item) {
                        for (const item of scan.item) {
                            vulnerabilities.push({
                                id: item.$.id,
                                msg: item.description?.[0] || 'No description',
                                uri: item.uri?.[0] || '',
                                method: item.method?.[0] || 'GET' // Default to GET if missing
                            });
                        }
                    }
                }
            }

            const startTime = parsed?.niktoscan?.$.start || new Date().toISOString();
            const endTime = parsed?.niktoscan?.$.end || new Date().toISOString();

            return {
                target: targetUrl,
                vulnerabilities,
                startTime,
                endTime
            };

        } catch (error: any) {
            console.error("[Nikto] Scan failed", { target: targetUrl, error: error.message });
            // Cleanup
            try { await fs.unlink(tempFile); } catch { /* ignore cleanup error */ }
            throw error;
        } finally {
            // Cleanup
            try { await fs.unlink(tempFile); } catch { /* ignore cleanup error */ }
        }
    }
}

export const niktoService = new NiktoService();
