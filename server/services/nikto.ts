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
    async scan(targetUrl: string): Promise<NiktoResult> {
        // Use /tmp directly (more reliable in Docker)
        const tempFile = `/tmp/nikto-${Date.now()}.xml`;

        try {
            // -h: Host
            // -Format xml: XML output
            // -o: Output file
            // -Tuning:
            //   x: Reverse Lookup (often slow/fails)
            //   6: Denial of Service (unsafe/slow)
            // -maxtime: Limit scan time to 5 minutes (300s)
            // -nointeractive: Ensure no prompts
            // -ask no: Don't ask for confirmation
            const command = `nikto -h ${targetUrl} -Format xml -o ${tempFile} -maxtime 300s -Tuning x6 -nointeractive -ask no`;

            console.log(`[Nikto] Executing: ${command}`);
            console.log(`[Nikto] Output file: ${tempFile}`);

            try {
                const { stdout, stderr } = await execAsync(command, {
                    maxBuffer: 1024 * 1024 * 20,
                    timeout: 360000 // 6 minute timeout (slightly more than maxtime)
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
                console.error(`[Nikto] Cannot read output file: ${readErr.message}`);
                throw new Error("Nikto failed to generate output file.");
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
            console.error(`[Nikto] Scan failed for ${targetUrl}:`, error.message);
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
