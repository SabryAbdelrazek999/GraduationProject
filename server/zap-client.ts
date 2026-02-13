import axios from "axios";

interface ZapAlert {
  id: string;
  pluginId: string;
  pluginName?: string;
  alert?: string; // Often ZAP uses 'alert' for the name
  name?: string;
  description: string;
  solution: string;
  riskCode?: string;
  riskcode?: string; // Some versions use lowercase
  risk?: string; // String representation (High, Medium, etc)
  confidence: string;
  riskdesc?: string;
  confidencedesc?: string;
  url: string;
  messageId?: string;
  evidence?: string;
  param?: string;
}

interface ZapScanResult {
  alerts: ZapAlert[];
  vulnerabilities: Array<{
    type: string;
    severity: "critical" | "high" | "medium" | "low";
    title: string;
    description: string;
    affectedUrl: string;
    remediation: string;
    details: Record<string, any>;
  }>;
}

/**
 * ZAP client for communicating with OWASP ZAP daemon.
 * Uses ZAP_API_URL environment variable (default: http://localhost:8080)
 */
export class ZapClient {
  private baseUrl: string;
  private client = axios.create({
    headers: {
      'User-Agent': 'ZAP-Scanner-Client'
    }
  });
  private activeScanIds: Set<string> = new Set();

  constructor(baseUrl?: string) {
    // Use environment variable with fallback
    // When running on host machine, use localhost:8081 (docker-compose port mapping)
    // In Docker container, would use: zap service name
    this.baseUrl = baseUrl || process.env.ZAP_API_URL || "http://localhost:8081";
    console.log(`[ZAP] Initialized client with base URL: ${this.baseUrl}`);
  }

  /**
   * Check if ZAP daemon is ready with exponential backoff retry
   */
  async isReady(maxAttempts = 30, initialDelay = 2000): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        console.log(`[ZAP] Checking daemon readiness (attempt ${i + 1}/${maxAttempts})...`);
        const response = await this.client.get(`${this.baseUrl}`, {
          timeout: 10000,
        });
        if (response.status === 200) {
          console.log('[ZAP] ✅ Daemon is ready!');
          return true;
        }
      } catch (error: any) {
        const delay = initialDelay * Math.pow(1.5, i); // Exponential backoff
        console.log(`[ZAP] ⏳ Attempt ${i + 1} failed: ${error.message}. Retrying in ${Math.round(delay / 1000)}s...`);

        if (i < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error('[ZAP] ❌ Daemon failed to start within timeout');
    return false;
  }

  /**
   * Create a new session to clear ZAP's internal database
   * This prevents the "Data cache size limit is reached" error
   */
  async clearSession(): Promise<void> {
    try {
      console.log('[ZAP] Creating new session to clear database...');
      await this.client.get(
        `${this.baseUrl}/JSON/core/action/newSession?overwrite=true`,
        { timeout: 30000 }
      );
      console.log('[ZAP] ✅ New session created, database cleared');
    } catch (error: any) {
      console.log(`[ZAP] ⚠️  Could not create new session: ${error.message}`);
      // Non-fatal, continue anyway
    }
  }

  /**
   * Stop an active scan
   */
  async stopScan(scanId: string): Promise<void> {
    try {
      console.log(`[ZAP] Stopping active scan ${scanId}...`);
      await this.client.get(
        `${this.baseUrl}/JSON/ascan/action/stop?scanId=${scanId}`,
        { timeout: 10000 }
      );
      this.activeScanIds.delete(scanId);
      console.log(`[ZAP] ✅ Scan ${scanId} stopped`);
    } catch (error: any) {
      console.error(`[ZAP] Failed to stop scan ${scanId}:`, error.message);
    }
  }

  /**
   * Stop all active scans
   */
  async stopAllScans(): Promise<void> {
    try {
      console.log('[ZAP] Stopping all active scans...');
      await this.client.get(
        `${this.baseUrl}/JSON/ascan/action/stopAllScans`,
        { timeout: 10000 }
      );
      this.activeScanIds.clear();
      console.log('[ZAP] ✅ All scans stopped');
    } catch (error: any) {
      console.error('[ZAP] Failed to stop all scans:', error.message);
    }
  }

  /**
   * Start an active scan on the target URL
   * Returns scan ID
   */
  async startScan(targetUrl: string, scanDepth: string = "medium"): Promise<string> {
    try {
      // Clear previous session to free up database cache
      await this.clearSession();

      console.log(`[ZAP] Starting active scan for ${targetUrl} (depth: ${scanDepth})`);

      // First, add URL to context
      const encodedUrl = encodeURIComponent(targetUrl);

      // Step 1: Access the URL first (important!)
      try {
        await this.client.get(
          `${this.baseUrl}/JSON/core/action/accessUrl?url=${encodedUrl}`,
          { timeout: 30000 }
        );
        console.log(`[ZAP] ✅ URL accessed: ${targetUrl}`);
      } catch (err) {
        console.log(`[ZAP] ⚠️  Could not access URL directly, continuing...`);
      }

      // Step 2: Spider the target (configure based on depth)
      try {
        let maxChildren: number;
        
        if (scanDepth === "shallow") {
          maxChildren = 5;  // Only 5 pages for quick scan
        } else if (scanDepth === "deep") {
          maxChildren = 0;  // Unlimited pages for comprehensive scan
        } else {
          maxChildren = 8; // 8 pages for standard scan (reduced from 10 for faster scanning)
        }
        
        const spiderResponse = await this.client.get(
          `${this.baseUrl}/JSON/spider/action/scan?url=${encodedUrl}&maxChildren=${maxChildren}&recurse=true`,
          { timeout: 30000 }
        );
        const spiderScanId = spiderResponse.data.scan;
        console.log(`[ZAP] Spider started with ID: ${spiderScanId} (maxChildren: ${maxChildren})`);

        // Wait for spider to complete. Use shorter timeouts for shallow scans
        // to keep quick scans fast while allowing deeper scans more time.
        let spiderTimeoutMs = 20000; // default 20s
        if (scanDepth === "shallow") spiderTimeoutMs = 5000;   // 5s for shallow
        if (scanDepth === "medium") spiderTimeoutMs = 20000;   // 20s for medium
        if (scanDepth === "deep") spiderTimeoutMs = 120000;    // 2min for deep

        await this.waitForSpider(spiderScanId, spiderTimeoutMs);
      } catch (err: any) {
        console.log(`[ZAP] ⚠️  Spider failed or timed out: ${err.message}, continuing with active scan...`);
      }

      // Step 3: Start active scan
      const response = await this.client.get(
        `${this.baseUrl}/JSON/ascan/action/scan?url=${encodedUrl}&recurse=true`,
        { timeout: 30000 }
      );

      const scanId = String(response.data.scan);
      this.activeScanIds.add(scanId);
      console.log(`[ZAP] ✅ Active scan started with ID: ${scanId}`);
      return scanId;
    } catch (error: any) {
      console.error("[ZAP] Failed to start scan:", error.message);
      if (error.response) {
        console.error("[ZAP] Response data:", error.response.data);
        console.error("[ZAP] Response status:", error.response.status);
      }
      throw new Error(`ZAP scan initiation failed: ${error.message}`);
    }
  }

  /**
   * Poll spider status until completion
   */
  async waitForSpider(scanId: string, maxWaitMs?: number): Promise<void> {
    const defaultTimeout = parseInt(process.env.ZAP_SPIDER_TIMEOUT_MS || "60000", 10); // 60s default (reduced from 900s) 
    const timeout = maxWaitMs || defaultTimeout;
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds (increased from 5s for faster progress updates)

    while (Date.now() - startTime < timeout) {
      try {
        const response = await this.client.get(
          `${this.baseUrl}/JSON/spider/view/status?scanId=${scanId}`,
          { timeout: 15000 }
        );
        const progress = parseInt(response.data.status, 10);
        console.log(`[ZAP] Spider ${scanId} progress: ${progress}%`);

        if (progress === 100) {
          console.log(`[ZAP] ✅ Spider ${scanId} completed`);
          // Give it a moment to settle
          await new Promise(resolve => setTimeout(resolve, 2000));
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error: any) {
        console.error(`[ZAP] Error polling spider status:`, error.message);
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`ZAP spider ${scanId} did not complete within ${timeout}ms`);
  }

  /**
   * Poll scan status until completion
   * Progress is 0-100
   */
  async waitForScan(scanId: string, maxWaitMs: number, onProgress?: (progress: number) => void, abortSignal?: AbortSignal): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds (increased from 5s for faster progress updates)

    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Check if scan was aborted
        if (abortSignal?.aborted) {
          console.log(`[ZAP] Scan ${scanId} aborted by user, stopping ZAP scan...`);
          await this.stopScan(scanId);
          throw new Error("Scan cancelled by user");
        }

        const response = await this.client.get(
          `${this.baseUrl}/JSON/ascan/view/status?scanId=${scanId}`,
          { timeout: 15000 }
        );
        const progress = parseInt(response.data.status, 10);
        console.log(`[ZAP] Scan ${scanId} progress: ${progress}%`);

        if (onProgress) {
          onProgress(progress);
        }

        if (progress === 100) {
          this.activeScanIds.delete(scanId);
          console.log(`[ZAP] ✅ Scan ${scanId} completed`);
          return;
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error: any) {
        if (error.message === "Scan cancelled by user") {
          throw error;
        }
        console.error(`[ZAP] Error polling scan status:`, error.message);
        // Continue trying instead of throwing error immediately
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`ZAP scan ${scanId} did not complete within ${maxWaitMs}ms`);
  }

  /**
   * Retrieve all alerts for a scan
   */
  async getAlerts(scanId?: string): Promise<ZapAlert[]> {
    try {
      const baseParam = scanId ? `?scanId=${scanId}` : "";
      const response = await this.client.get(
        `${this.baseUrl}/JSON/core/view/alerts${baseParam}`,
        { timeout: 15000 }
      );

      const alerts: ZapAlert[] = response.data.alerts || [];
      console.log(`[ZAP] Retrieved ${alerts.length} alerts`);
      return alerts;
    } catch (error: any) {
      console.error("[ZAP] Failed to get alerts:", error.message);
      return [];
    }
  }

  /**
   * Convert ZAP alerts to our vulnerability format
   */
  convertAlertsToVulnerabilities(alerts: ZapAlert[]): ZapScanResult["vulnerabilities"] {
    if (alerts.length > 0) {
      console.log(`[ZAP] Debug - First alert keys: ${Object.keys(alerts[0]).join(", ")}`);
      const first = alerts[0];
      console.log(`[ZAP] Debug - Risk data: riskCode=${first.riskCode}, riskcode=${first.riskcode}, risk=${first.risk}`);
    }

    const riskMap: Record<string, "critical" | "high" | "medium" | "low"> = {
      "3": "high",
      "High": "high",
      "2": "medium",
      "Medium": "medium",
      "1": "low",
      "Low": "low",
      "0": "low",
      "Informational": "low",
    };

    return alerts.map((alert) => {
      // Find the best risk indicator
      const riskKey = alert.riskCode || alert.riskcode || alert.risk || "0";
      const severity = (riskMap[riskKey] || "low") as "critical" | "high" | "medium" | "low";
      const name = alert.alert || alert.name || alert.pluginName || "Unknown Vulnerability";

      return {
        type: alert.pluginName || name,
        severity,
        title: name,
        description: alert.description || "No description provided",
        affectedUrl: alert.url,
        remediation: alert.solution || "No solution provided",
        details: {
          pluginId: alert.pluginId,
          confidence: alert.confidencedesc || alert.confidence,
          evidence: alert.evidence || null,
          param: alert.param || null,
          riskCode: alert.riskCode || alert.riskcode,
          sourceRisk: alert.risk,
        },
      };
    });
  }

  /**
   * Perform a complete scan: start, wait, and retrieve results
   */
  async performScan(targetUrl: string, scanDepth: string, onProgress?: (progress: number) => void, abortSignal?: AbortSignal): Promise<ZapScanResult> {
    // Check if ZAP is ready with retry
    const ready = await this.isReady();
    if (!ready) {
      throw new Error("ZAP daemon is not ready. Check that it is running and accessible.");
    }

    // Configure timeout based on scan depth
    // Shallow: very quick overall timeout, Medium: moderate, Deep: long
    let maxWaitMs: number;
    if (scanDepth === "shallow") {
      maxWaitMs = 15000;  // 15 seconds for quick scan
    } else if (scanDepth === "deep") {
      maxWaitMs = 600000; // 10 minutes for comprehensive scan
    } else {
      maxWaitMs = 120000; // 2 minutes for standard scan
    }

    try {
      // Start the scan
      const scanId = await this.startScan(targetUrl, scanDepth);

      // Wait for completion with appropriate timeout
      await this.waitForScan(scanId, maxWaitMs, onProgress, abortSignal);

      // Get results
      const alerts = await this.getAlerts(scanId);
      const vulnerabilities = this.convertAlertsToVulnerabilities(alerts);

      return { alerts, vulnerabilities };
    } catch (error: any) {
      console.error("[ZAP] Scan failed:", error.message);
      throw error;
    }
  }
}

// Default export for easy import
export const zapClient = new ZapClient();
