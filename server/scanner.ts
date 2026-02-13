import { storage } from "./storage";
import { zapClient } from "./zap-client";
import { httpxService } from "./services/httpx";
import { nmapService } from "./services/nmap";
import { niktoService } from "./services/nikto";
import type { InsertVulnerability } from "@shared/schema";

/**
 * Smoothly update progress from current to target value
 * Creates smooth animation of progress bar
 */
async function updateProgressSmooth(
  scanId: string,
  fromProgress: number,
  toProgress: number,
  durationMs: number,
  controller: AbortController
): Promise<void> {
  const steps = 20;
  const interval = durationMs / steps;
  const increment = (toProgress - fromProgress) / steps;
  
  let current = fromProgress;
  
  for (let i = 0; i <= steps; i++) {
    if (controller.signal.aborted) throw new Error("Scan cancelled by user");
    
    current = Math.min(fromProgress + increment * i, toProgress);
    await storage.updateScan(scanId, { progress: Math.round(current) });
    
    if (i < steps) {
      await new Promise(r => setTimeout(r, interval));
    }
  }
  
  await storage.updateScan(scanId, { progress: Math.round(toProgress) });
}

interface ScanResult {
  vulnerabilities: InsertVulnerability[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

// Map to store AbortControllers for active scans
const activeScanAbortControllers = new Map<string, AbortController>();
// Map to store progress intervals so we can smoothly increment progress per-scan
const activeProgressIntervals = new Map<string, NodeJS.Timeout>();

export function setScanAbortController(scanId: string, abortController: AbortController): void {
  activeScanAbortControllers.set(scanId, abortController);
}

export async function performScan(scanId: string, targetUrl: string, scanType: string, abortController?: AbortController): Promise<ScanResult> {
  const vulnerabilities: InsertVulnerability[] = [];
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // Use provided AbortController or create a new one
  const controller = abortController || new AbortController();
  if (!abortController) {
    activeScanAbortControllers.set(scanId, controller);
  }

  // ensure any previous progress interval cleared when scan finishes/cancels
  const clearProgressInterval = () => {
    const it = activeProgressIntervals.get(scanId);
    if (it) {
      clearInterval(it);
      activeProgressIntervals.delete(scanId);
    }
  };

  const urlObj = new URL(targetUrl);
  const hostname = urlObj.hostname;

  try {

    // Update scan status to running
    await storage.updateScan(scanId, {
      status: "running",
      startedAt: new Date(),
      progress: 0
    });

    // Check if scan was cancelled
    if (controller.signal.aborted) {
      throw new Error("Scan cancelled by user");
    }

    console.log(`[Scanner] Starting ${scanType} scan pipeline for ${targetUrl}`);

    // --- Stage 1: Httpx (Always run - quick validation) ---
    if (controller.signal.aborted) throw new Error("Scan cancelled by user");
    console.log(`[Scanner] Stage 1: Httpx - Validating target...`);
    // Progress: 0-15% during Httpx stage (2 seconds)
    await updateProgressSmooth(scanId, 0, 15, 2000, controller);

    let httpxResult;
    try {
      httpxResult = await httpxService.scan(targetUrl);

      if (httpxResult.reachable) {
        console.log(`[Scanner] Httpx validated target successfully`);
        // Record Httpx findings (Tech Stack)
        if (httpxResult.tech && httpxResult.tech.length > 0) {
          vulnerabilities.push({
            scanId,
            type: "info",
            severity: "info",
            title: "Detected Technologies",
            description: `Technologies detected by httpx: ${httpxResult.tech.join(", ")}`,
            affectedUrl: targetUrl,
            details: JSON.stringify(httpxResult, null, 2),
            remediation: "Information only."
          });
        }
      } else {
        console.warn(`[Scanner] Httpx reported target as unreachable, trying fallback...`);
      }
    } catch (httpxError: any) {
      console.warn(`[Scanner] Httpx failed (${httpxError.message}), continuing with fallback validation...`);
      httpxResult = { reachable: false };
    }

    // Fallback: If httpx failed, do a simple HTTP request to validate target
    if (!httpxResult?.reachable) {
      try {
        const response = await fetch(targetUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        if (response.ok || response.status < 500) {
          console.log(`[Scanner] Fallback validation succeeded (HTTP ${response.status})`);
          httpxResult = { reachable: true, url: targetUrl };
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (fallbackError: any) {
        console.error(`[Scanner] Fallback validation also failed: ${fallbackError.message}`);
        throw new Error(`Target ${targetUrl} is unreachable (httpx and fallback both failed).`);
      }
    }


    // --- Stage 2: Nmap (Skip for shallow scan) ---
    if (controller.signal.aborted) throw new Error("Scan cancelled by user");

    if (scanType === "shallow") {
      console.log(`[Scanner] Stage 2: Nmap - Skipped (shallow mode)`);
      // Quick progress from 15 to 35 (1 second)
      await updateProgressSmooth(scanId, 15, 35, 1000, controller);
    } else {
      console.log(`[Scanner] Stage 2: Nmap - Port scanning (${scanType} mode)...`);
      
      // Duration varies by scan type
      let nmapDuration: number;
      if (scanType === "deep") {
        nmapDuration = 8000; // 8 seconds for deep
      } else {
        nmapDuration = 4000; // 4 seconds for medium
      }
      
      // Progress: 15-35% with smooth animation
      await updateProgressSmooth(scanId, 15, 35, nmapDuration, controller);

      try {
        const nmapResult = await nmapService.scan(hostname, scanType);

        if (nmapResult.openPorts.length > 0) {
          const portsDesc = nmapResult.openPorts.map(p => `${p.port}/${p.protocol} (${p.service})`).join(", ");
          vulnerabilities.push({
            scanId,
            type: "info",
            severity: "low",
            title: "Open Ports Discovered",
            description: `Nmap found the following open ports: ${portsDesc}`,
            affectedUrl: hostname,
            details: nmapResult.rawOutput,
            remediation: "Ensure only necessary ports are exposed."
          });
          lowCount++;
        }
      } catch (nmapError: any) {
        console.warn(`[Scanner] Nmap failed: ${nmapError.message}`);
      }
    }

    // --- Stage 3: Nikto (Skip for shallow scan) ---
    if (controller.signal.aborted) throw new Error("Scan cancelled by user");
    
    if (scanType === "shallow") {
      console.log(`[Scanner] Stage 3: Nikto - Skipped (shallow mode)`);
      // Quick progress from 35 to 50 (1 second)
      await updateProgressSmooth(scanId, 35, 50, 1000, controller);
    } else {
      console.log(`[Scanner] Stage 3: Nikto - Web server scanning (${scanType} mode)...`);
      
      // Duration varies by scan type
      let niktoDuration: number;
      if (scanType === "deep") {
        niktoDuration = 10000; // 10 seconds for deep
      } else {
        niktoDuration = 3000; // 3 seconds for medium
      }
      
      // Progress: 35-50% with smooth animation
      await updateProgressSmooth(scanId, 35, 50, niktoDuration, controller);

      try {
        const niktoResult = await niktoService.scan(targetUrl, scanType);

        for (const v of niktoResult.vulnerabilities) {
          vulnerabilities.push({
            scanId,
            type: "web",
            severity: "medium",
            title: `Nikto: ${v.msg.substring(0, 100)}...`,
            description: v.msg,
            affectedUrl: v.uri ? new URL(v.uri, targetUrl).toString() : targetUrl,
            details: `Nikto ID: ${v.id}, Method: ${v.method}`,
            remediation: "Check web server configuration."
          });
          mediumCount++;
        }
      } catch (e: any) {
        console.warn(`[Scanner] Nikto failed: ${e.message}`);
      }
    }

    // --- Stage 4: OWASP ZAP (Always run, but with different settings) ---
    if (controller.signal.aborted) throw new Error("Scan cancelled by user");
    console.log(`[Scanner] Stage 4: ZAP - Active scanning (${scanType} mode)...`);

    // Progress: 50-95% during ZAP stage
    let zapResult: any = { vulnerabilities: [] };
    try {
      const zapReady = await zapClient.isReady(2, 500).catch(() => false);
      
      if (!zapReady) {
        console.warn(`[Scanner] ZAP daemon not accessible, skipping ZAP scan`);
        await updateProgressSmooth(scanId, 50, 90, 2000, controller);
      } else {
        const startZapTime = Date.now();
        let lastZapProgress = 50;

        // Get expected ZAP duration based on scan type
        let expectedZapDuration: number;
        if (scanType === "shallow") {
          expectedZapDuration = 30000; // 30 seconds
        } else if (scanType === "deep") {
          expectedZapDuration = 600000; // 10 minutes
        } else {
          expectedZapDuration = 180000; // 3 minutes (medium)
        }

        zapResult = await zapClient.performScan(targetUrl, scanType, async (progress) => {
          // Track elapsed time
          const elapsed = Date.now() - startZapTime;
          
          // Map ZAP progress (0-100) to 50-90 range
          const mappedProgress = 50 + Math.floor((progress / 100) * 40);
          lastZapProgress = mappedProgress;
          
          // Update progress
          await storage.updateScan(scanId, { progress: mappedProgress });
          
          const elapsedSeconds = Math.round(elapsed / 1000);
          const expectedSeconds = Math.round(expectedZapDuration / 1000);
          console.log(`[Scanner] ZAP progress: ${progress}% (mapped: ${mappedProgress}%, elapsed: ${elapsedSeconds}s of ~${expectedSeconds}s)`);
        }, controller.signal);

        // Ensure we at least reach 90% after ZAP completes
        if (lastZapProgress < 90) {
          await updateProgressSmooth(scanId, lastZapProgress, 90, 2000, controller);
        }
      }
    } catch (zapError: any) {
      if (zapError.message === "Scan cancelled by user") {
        throw zapError;
      }
      console.error(`[Scanner] ZAP scan error: ${zapError.message}`);
      zapResult = { vulnerabilities: [] };
    }

    // Convert ZAP vulnerabilities
    const zapVulnerabilities = zapResult.vulnerabilities.map((vuln) => ({
      ...vuln,
      scanId,
      affectedUrl: vuln.affectedUrl || targetUrl,
    } as InsertVulnerability));

    vulnerabilities.push(...zapVulnerabilities);

    // Count ZAP severities
    for (const vuln of zapVulnerabilities) {
      switch (vuln.severity) {
        case "critical": criticalCount++; break;
        case "high": highCount++; break;
        case "medium": mediumCount++; break;
        case "low": lowCount++; break;
      }
    }

    // --- Finalization ---
    console.log(`[Scanner] Pipeline complete. Saving ${vulnerabilities.length} findings.`);
    // Progress: 90-100% during finalization (2 seconds)
    await updateProgressSmooth(scanId, 90, 100, 2000, controller);

    // Save vulnerabilities
    for (const vuln of vulnerabilities) {
      try {
        await storage.createVulnerability(vuln);
      } catch (err) {
        console.error("Failed to save vulnerability:", err);
      }
    }

    // Update scan status
    clearProgressInterval();
    await storage.updateScan(scanId, {
      status: "completed",
      completedAt: new Date(),
      totalVulnerabilities: vulnerabilities.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      progress: 100
    });

    // Create Report
    try {
      const saved = await storage.getScan(scanId);
      if (saved) {
        await storage.createReport({
          userId: saved.userId,
          scanId: saved.id,
          reportName: `Unified Scan Report - ${saved.targetUrl}`,
          reportPath: `/api/reports/export/${scanId}`,
          createdAt: new Date(),
          total: vulnerabilities.length,
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount,
        } as any);
      }
    } catch (err) {
      console.error("Failed to create report entry:", err);
    }

  } catch (error: any) {
    console.error(`[Scanner] Scan pipeline failed: ${error.message}`);

    // Remove abort controller and any progress interval
    activeScanAbortControllers.delete(scanId);
    clearProgressInterval();

    // Update failed status
    const status = error.message === "Scan cancelled by user" ? "cancelled" : "failed";
    await storage.updateScan(scanId, {
      status: status as any,
      completedAt: new Date(),
      totalVulnerabilities: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    });

    // Return empty results on catastrophic failure
    return {
      vulnerabilities: [],
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    };
  }

  return {
    vulnerabilities,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}

export function cancelScan(scanId: string): boolean {
  const abortController = activeScanAbortControllers.get(scanId);
  if (abortController) {
    abortController.abort();
    return true;
  }
  return false;
}

export async function getLastScanTime(): Promise<string> {
  const scans = await storage.getRecentScans(1);
  if (scans.length === 0) {
    return "Never";
  }
  const lastScan = scans[0];
  if (lastScan.completedAt) {
    const diff = Date.now() - new Date(lastScan.completedAt).getTime();
    if (diff < 60000) return "Just Now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return new Date(lastScan.completedAt).toLocaleDateString();
  }
  return "In Progress";
}
