import { storage } from "./storage";
import { zapClient } from "./zap-client";
import { httpxService } from "./services/httpx";
import { nmapService } from "./services/nmap";
import { niktoService } from "./services/nikto";
import type { InsertVulnerability } from "@shared/schema";

interface ScanResult {
  vulnerabilities: InsertVulnerability[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export async function performScan(scanId: string, targetUrl: string, scanType: string): Promise<ScanResult> {
  const vulnerabilities: InsertVulnerability[] = [];
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  try {
    const urlObj = new URL(targetUrl);
    const hostname = urlObj.hostname;

    // Update scan status to running
    await storage.updateScan(scanId, {
      status: "running",
      startedAt: new Date()
    });

    console.log(`[Scanner] Starting pipeline for ${targetUrl}`);

    // --- Stage 1: Httpx (Optional - best effort) ---
    console.log(`[Scanner] Stage 1: Httpx - Validating target...`);
    await storage.updateScan(scanId, { progress: 10 });

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


    // --- Stage 2: Nmap (Mandatory) ---
    console.log(`[Scanner] Stage 2: Nmap - Port scanning...`);
    await storage.updateScan(scanId, { progress: 25 });

    let nmapResult;
    try {
      nmapResult = await nmapService.scan(hostname);
    } catch (e) {
      throw new Error("Nmap scan failed. Aborting pipeline.");
    }

    if (nmapResult.openPorts.length > 0) {
      const portsDesc = nmapResult.openPorts.map(p => `${p.port}/${p.protocol} (${p.service})`).join(", ");
      vulnerabilities.push({
        scanId,
        type: "info",
        severity: "low", // Open ports can be low severity
        title: "Open Ports Discovered",
        description: `Nmap found the following open ports: ${portsDesc}`,
        affectedUrl: hostname,
        details: nmapResult.rawOutput,
        remediation: "Ensure only necessary ports are exposed."
      });
      lowCount++;
    }

    // --- Stage 3: Nikto ---
    console.log(`[Scanner] Stage 3: Nikto - Web server scanning...`);
    await storage.updateScan(scanId, { progress: 40 });

    try {
      const niktoResult = await niktoService.scan(targetUrl);

      for (const v of niktoResult.vulnerabilities) {
        vulnerabilities.push({
          scanId,
          type: "web", // categorize as web
          severity: "medium", // Default Nikto findings to medium (often config issues)
          title: `Nikto: ${v.msg.substring(0, 100)}...`, // Truncate title
          description: v.msg,
          affectedUrl: v.uri ? new URL(v.uri, targetUrl).toString() : targetUrl,
          details: `Nikto ID: ${v.id}, Method: ${v.method}`,
          remediation: "Check web server configuration."
        });
        mediumCount++;
      }
    } catch (e: any) {
      console.error(`[Scanner] Nikto failed: ${e.message}`);
      // Log error but allow ZAP to proceed as Nikto is "optional" in the sense that ZAP is the main scanner?
      // User requirements: "ZAP and Nikto only scan validated, reachable targets."
      // Doesn't strictly say if Nikto fails, ZAP must stop. 
      // I'll add an error entry but continue.
      vulnerabilities.push({
        scanId,
        type: "error",
        severity: "info",
        title: "Nikto Scan Failed",
        description: `Nikto scan encountered an error: ${e.message}`,
        affectedUrl: targetUrl,
      });
    }

    // --- Stage 4: OWASP ZAP ---
    console.log(`[Scanner] Stage 4: ZAP - Active scanning...`);
    await storage.updateScan(scanId, { progress: 60 });

    const zapResult = await zapClient.performScan(targetUrl, scanType, async (progress) => {
      // Map ZAP progress (0-100) to 60-95 range
      const overallProgress = 60 + Math.floor((progress / 100) * 35);
      await storage.updateScan(scanId, { progress: overallProgress });
    });

    // Convert ZAP vulnerabilities
    const zapVulnerabilities = zapResult.vulnerabilities.map((vuln) => ({
      ...vuln,
      scanId,
      affectedUrl: vuln.affectedUrl || targetUrl,
    } as InsertVulnerability));

    vulnerabilities.push(...zapVulnerabilities);

    // Count ZAP severities
    for (const vuln of zapVulnerabilities) {
      // Existing ZAP counts logic
      // Note: we already counted Nikto/Httpx items above
      switch (vuln.severity) {
        case "critical": criticalCount++; break;
        case "high": highCount++; break;
        case "medium": mediumCount++; break;
        case "low": lowCount++; break;
      }
    }

    // --- Finalization ---
    console.log(`[Scanner] Pipeline complete. Saving ${vulnerabilities.length} findings.`);
    await storage.updateScan(scanId, { progress: 95 });

    // Save vulnerabilities
    for (const vuln of vulnerabilities) {
      try {
        await storage.createVulnerability(vuln);
      } catch (err) {
        console.error("Failed to save vulnerability:", err);
      }
    }

    // Update scan status
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

    // Update failed status
    await storage.updateScan(scanId, {
      status: "failed",
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
