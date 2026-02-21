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
  infoCount: number;
}

// Map to store AbortControllers for active scans
const activeScanAbortControllers = new Map<string, AbortController>();
// Map to store progress intervals so we can smoothly increment progress per-scan
const activeProgressIntervals = new Map<string, NodeJS.Timeout>();

export function setScanAbortController(scanId: string, abortController: AbortController): void {
  activeScanAbortControllers.set(scanId, abortController);
}

/**
 * Calculate similarity between two strings (0-1, where 1 is identical)
 * Uses Levenshtein distance algorithm
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      const cost = s1[j - 1] === s2[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return 1 - (distance / maxLen);
}

/**
 * Check if two vulnerabilities are duplicates
 */
function areDuplicateVulnerabilities(vuln1: InsertVulnerability, vuln2: InsertVulnerability): boolean {
  // Same or similar URL
  const urlSimilarity = calculateStringSimilarity(
    vuln1.affectedUrl || '',
    vuln2.affectedUrl || ''
  );
  
  // If both vulnerabilities include a ZAP pluginId in details, consider them duplicates
  const p1 = (vuln1.details && (vuln1.details as any).pluginId) || null;
  const p2 = (vuln2.details && (vuln2.details as any).pluginId) || null;
  if (p1 && p2 && String(p1) === String(p2)) {
    return true;
  }

  if (urlSimilarity < 0.8) return false;

  const titleSimilarity = calculateStringSimilarity(
    vuln1.title || '',
    vuln2.title || ''
  );

  if (titleSimilarity < 0.6) return false;
  if (vuln1.severity !== vuln2.severity) return false;
  if (vuln1.type !== vuln2.type) return false;

  return true;
}

/**
 * Remove duplicate vulnerabilities from the list
 */
function deduplicateVulnerabilities(vulnerabilities: InsertVulnerability[]): {
  deduplicated: InsertVulnerability[];
  removedCount: number;
  duplicateInfo: Array<{ original: string; duplicates: number }>;
} {
  const deduplicated: InsertVulnerability[] = [];
  const duplicateInfo: Array<{ original: string; duplicates: number }> = [];
  let removedCount = 0;
  
  for (const vuln of vulnerabilities) {
    let isDuplicate = false;
    let duplicateOfIndex = -1;
    
    for (let i = 0; i < deduplicated.length; i++) {
      if (areDuplicateVulnerabilities(vuln, deduplicated[i])) {
        isDuplicate = true;
        duplicateOfIndex = i;
        break;
      }
    }
    
    if (!isDuplicate) {
      deduplicated.push(vuln);
    } else {
      removedCount++;
      const origTitle = deduplicated[duplicateOfIndex].title || 'Unknown';
      const existingInfo = duplicateInfo.find(d => d.original === origTitle);
      if (existingInfo) {
        existingInfo.duplicates++;
      } else {
        duplicateInfo.push({ original: origTitle, duplicates: 1 });
      }
    }
  }
  
  return { deduplicated, removedCount, duplicateInfo };
}

export async function performScan(scanId: string, targetUrl: string, scanType: string, abortController?: AbortController): Promise<ScanResult> {
  const vulnerabilities: InsertVulnerability[] = [];
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let infoCount = 0;

  let finalVulnerabilities: InsertVulnerability[] = [];
  let finalCriticalCount = 0;
  let finalHighCount = 0;
  let finalMediumCount = 0;
  let finalLowCount = 0;
  let finalInfoCount = 0;

  const controller = abortController || new AbortController();
  if (!abortController) {
    activeScanAbortControllers.set(scanId, controller);
  }

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
    await storage.updateScan(scanId, {
      status: "running",
      startedAt: new Date(),
      progress: 0
    });

    if (controller.signal.aborted) {
      throw new Error("Scan cancelled by user");
    }

    console.log(`[Scanner] Starting ${scanType} scan pipeline for ${targetUrl}`);

    // --- Stage 1: Target Validation (Httpx) ---
    if (controller.signal.aborted) throw new Error("Scan cancelled by user");
    console.log(`[Scanner] Stage 1: Validating target with Httpx...`);
    await updateProgressSmooth(scanId, 0, 10, 3000, controller);

    let targetValidated = false;
    let targetInfo: any = {};
    
    try {
      const httpxResult: any = await httpxService.scan(targetUrl);
      
      if (httpxResult && httpxResult.statusCode && httpxResult.statusCode < 500) {
        console.log(`[Scanner] ✅ Target validated via Httpx (HTTP ${httpxResult.statusCode})`);
        targetValidated = true;
        targetInfo = {
          status: httpxResult.statusCode,
          contentType: httpxResult.contentType || 'Unknown',
          server: httpxResult.webserver || 'Unknown',
          title: httpxResult.title || ''
        };
      }
    } catch (validationError: any) {
      console.warn(`[Scanner] Primary validation failed via Httpx: ${validationError.message}`);
    }

    if (!targetValidated) {
      console.warn(`[Scanner] ⚠️  Could not validate target ${targetUrl}, but continuing scan anyway...`);
      vulnerabilities.push({
        scanId,
        type: "info",
        severity: "info",
        title: "Target Pre-Validation Note",
        description: `Initial validation via Httpx was inconclusive. This does not necessarily mean the target is unreachable - scan will proceed.`,
        affectedUrl: targetUrl,
        details: "Target might be blocking automated HTTP requests.",
        remediation: "If scan finds vulnerabilities, this warning can be ignored."
      });
    } else if (targetInfo.server || targetInfo.title) {
      vulnerabilities.push({
        scanId,
        type: "info",
        severity: "info",
        title: "Server Information",
        description: `Web server: ${targetInfo.server || 'Unknown'} | Title: ${targetInfo.title || 'Unknown'}`,
        affectedUrl: targetUrl,
        details: JSON.stringify(targetInfo, null, 2),
        remediation: "Information only."
      });
    }

    // --- Stage 2: Nmap (Skip for shallow scan) ---
    if (controller.signal.aborted) throw new Error("Scan cancelled by user");

    if (scanType === "shallow") {
      console.log(`[Scanner] Stage 2: Nmap - Skipped (shallow mode)`);
      await updateProgressSmooth(scanId, 10, 30, 1000, controller);
    } else {
      console.log(`[Scanner] Stage 2: Nmap - Port scanning (${scanType} mode)...`);
      
      let nmapDuration = scanType === "deep" ? 8000 : 4000;
      await updateProgressSmooth(scanId, 10, 30, nmapDuration, controller);

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
        } else {
          console.log(`[Scanner] Nmap completed but found no open ports`);
        }
      } catch (nmapError: any) {
        console.warn(`[Scanner] ⚠️  Nmap failed: ${nmapError.message}, continuing scan...`);
      }
    }

    // --- Stage 3: Nikto (Skip for shallow scan) ---
    if (controller.signal.aborted) throw new Error("Scan cancelled by user");
    
    if (scanType === "shallow") {
      console.log(`[Scanner] Stage 3: Nikto - Skipped (shallow mode)`);
      await updateProgressSmooth(scanId, 30, 45, 1000, controller);
    } else {
      console.log(`[Scanner] Stage 3: Nikto - Web server scanning (${scanType} mode)...`);
      
      let niktoDuration = scanType === "deep" ? 10000 : 3000;
      await updateProgressSmooth(scanId, 30, 45, niktoDuration, controller);

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
        
        if (niktoResult.vulnerabilities.length === 0) {
          console.log(`[Scanner] Nikto completed but found no issues`);
        }
      } catch (niktoError: any) {
        console.warn(`[Scanner] ⚠️  Nikto failed: ${niktoError.message}, continuing scan...`);
      }
    }

    // --- Stage 4: OWASP ZAP (Always run, but with different settings) ---
    if (controller.signal.aborted) throw new Error("Scan cancelled by user");
    console.log(`[Scanner] Stage 4: ZAP - Active scanning (${scanType} mode)...`);

    let zapResult: any = { vulnerabilities: [] };
    try {
      const zapReady = await zapClient.isReady(2, 500).catch(() => false);
      
      if (!zapReady) {
        console.warn(`[Scanner] ⚠️  ZAP daemon not accessible, skipping ZAP scan but continuing...`);
        await updateProgressSmooth(scanId, 45, 90, 2000, controller);
      } else {
        const startZapTime = Date.now();
        let lastZapProgress = 45;

        let expectedZapDuration: number;
        if (scanType === "shallow") {
          expectedZapDuration = 180000; // 3 minutes
        } else if (scanType === "deep") {
          expectedZapDuration = 7200000; // 120 minutes
        } else {
          expectedZapDuration = 600000; // 10 minutes
        }

        console.log(`[Scanner] 🔍 ZAP scan starting with expected duration: ${Math.round(expectedZapDuration / 60000)} minutes`);

        zapResult = await zapClient.performScan(targetUrl, scanType, async (progress) => {
          const elapsed = Date.now() - startZapTime;
          const mappedProgress = 45 + Math.floor((progress / 100) * 45);
          lastZapProgress = mappedProgress;
          
          await storage.updateScan(scanId, { progress: mappedProgress });
          
          const elapsedSeconds = Math.round(elapsed / 1000);
          const expectedSeconds = Math.round(expectedZapDuration / 1000);
          console.log(`[Scanner] ZAP progress: ${progress}% (mapped: ${mappedProgress}%, elapsed: ${elapsedSeconds}s of ~${expectedSeconds}s)`);
        }, controller.signal);

        console.log(`[Scanner] 📊 ZAP scan complete with ${zapResult.vulnerabilities?.length || 0} vulnerabilities found`);

        if (lastZapProgress < 90) {
          await updateProgressSmooth(scanId, lastZapProgress, 90, 2000, controller);
        }
      }
    } catch (zapError: any) {
      if (zapError.message === "Scan cancelled by user") {
        throw zapError;
      }
      console.warn(`[Scanner] ⚠️  ZAP scan error: ${zapError.message}, continuing with other results...`);
      zapResult = { vulnerabilities: [] };
      await updateProgressSmooth(scanId, 45, 90, 2000, controller);
    }

    const zapVulnerabilities = zapResult.vulnerabilities.map((vuln: any) => ({
      ...vuln,
      scanId,
      affectedUrl: vuln.affectedUrl || targetUrl,
    } as InsertVulnerability));

    vulnerabilities.push(...zapVulnerabilities);

    for (const vuln of zapVulnerabilities) {
      switch (vuln.severity) {
        case "critical": criticalCount++; break;
        case "high": highCount++; break;
        case "medium": mediumCount++; break;
        case "low": lowCount++; break;
        case "info": infoCount++; break;
      }
    }

    // --- Finalization ---
    console.log(`[Scanner] ✅ Pipeline complete. Processing ${vulnerabilities.length} findings...`);
    
    const { deduplicated, removedCount, duplicateInfo } = deduplicateVulnerabilities(vulnerabilities);
    
    console.log(`[Scanner] 🔍 Deduplication: Removed ${removedCount} duplicate vulnerabilities`);
    
    finalVulnerabilities = deduplicated;
    
    for (const vuln of finalVulnerabilities) {
      switch (vuln.severity) {
        case "critical": finalCriticalCount++; break;
        case "high": finalHighCount++; break;
        case "medium": finalMediumCount++; break;
        case "low": finalLowCount++; break;
        case "info": finalInfoCount++; break;
      }
    }
    
    console.log(`[Scanner] ✅ Final results: ${finalVulnerabilities.length} unique vulnerabilities`);
    
    await updateProgressSmooth(scanId, 90, 100, 2000, controller);

    for (const vuln of finalVulnerabilities) {
      try {
        await storage.createVulnerability(vuln);
      } catch (err) {
        console.error("Failed to save vulnerability:", err);
      }
    }

    clearProgressInterval();
    await storage.updateScan(scanId, {
      status: "completed",
      completedAt: new Date(),
      totalVulnerabilities: finalVulnerabilities.length,
      criticalCount: finalCriticalCount,
      highCount: finalHighCount,
      mediumCount: finalMediumCount,
      lowCount: finalLowCount,
      infoCount: finalInfoCount,
      progress: 100
    });

    try {
      const saved = await storage.getScan(scanId);
      if (saved) {
        await storage.createReport({
          userId: saved.userId,
          scanId: saved.id,
          reportName: `CyberShield Vulnerability Report - ${saved.targetUrl}`,
          reportPath: `/api/reports/export/${scanId}`,
          createdAt: new Date(),
          total: finalVulnerabilities.length,
          critical: finalCriticalCount,
          high: finalHighCount,
          medium: finalMediumCount,
          low: finalLowCount,
          scanType: saved.scanType,
        } as any);
      }
    } catch (err) {
      console.error("Failed to create report entry:", err);
    }

  } catch (error: any) {
    if (error.message === "Scan cancelled by user") {
      console.log(`[Scanner] ❌ Scan cancelled by user`);
      activeScanAbortControllers.delete(scanId);
      clearProgressInterval();

      await storage.updateScan(scanId, {
        status: "cancelled",
        completedAt: new Date(),
        totalVulnerabilities: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
      });

      return {
        vulnerabilities: [],
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        infoCount: 0,
      };
    }

    console.error(`[Scanner] ⚠️  Scan encountered error: ${error.message}`);
    const { deduplicated: errorDeduplicated } = deduplicateVulnerabilities(vulnerabilities);

    let errorCriticalCount = 0;
    let errorHighCount = 0;
    let errorMediumCount = 0;
    let errorLowCount = 0;
    let errorInfoCount = 0;
    
    for (const vuln of errorDeduplicated) {
      switch (vuln.severity) {
        case "critical": errorCriticalCount++; break;
        case "high": errorHighCount++; break;
        case "medium": errorMediumCount++; break;
        case "low": errorLowCount++; break;
        case "info": errorInfoCount++; break;
      }
    }

    activeScanAbortControllers.delete(scanId);
    clearProgressInterval();

    await storage.updateScan(scanId, {
      status: "completed",
      completedAt: new Date(),
      totalVulnerabilities: errorDeduplicated.length,
      criticalCount: errorCriticalCount,
      highCount: errorHighCount,
      mediumCount: errorMediumCount,
      lowCount: errorLowCount,
      infoCount: errorInfoCount,
      progress: 100
    });

    for (const vuln of errorDeduplicated) {
      try {
        await storage.createVulnerability(vuln);
      } catch (err) {}
    }

    return {
      vulnerabilities: errorDeduplicated,
      criticalCount: errorCriticalCount,
      highCount: errorHighCount,
      mediumCount: errorMediumCount,
      lowCount: errorLowCount,
      infoCount: errorInfoCount,
    };
  }

  return {
    vulnerabilities: finalVulnerabilities,
    criticalCount: finalCriticalCount,
    highCount: finalHighCount,
    mediumCount: finalMediumCount,
    lowCount: finalLowCount,
    infoCount: finalInfoCount,
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