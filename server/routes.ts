import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { performScan, getLastScanTime } from "./scanner";
import { insertScanSchema, insertScheduledScanSchema, insertSettingsSchema } from "@shared/schema";
import { ZapClient } from "./zap-client";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d";

let currentApiKey: string = "zap_sk_" + Math.random().toString(36).substring(2, 18);

// ================= JWT AUTHENTICATION =================
function authenticateToken(req: any, res: any, next: any) {
  // Check API Key first (query param for downloads)
  const apiKey = req.query.apiKey as string;
  // console.log("Checking auth. apiKey:", apiKey, "currentApiKey:", currentApiKey);
  
  if (apiKey && apiKey === currentApiKey) {
    (req as any).isApiKeyAuth = true;
    return next();
  }

  const token = req.headers.authorization?.split(" ")[1] || req.cookies?.token;
  // console.log("Checking token. found:", !!token);

  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

function getUserId(req: any): string | null {
  return req.userId || null;
}

// ================= REGISTER ROUTES =================
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  
  // ----------- Health Check -----------
  app.get("/health", async (_req, res) => {
    try {
      // Check database connection
      const db = await storage.getStats();
      
      // Check ZAP connection
      const zapClient = new ZapClient();
      const zapReady = await zapClient.isReady(1, 1000); // Quick check
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
        zap: zapReady ? "connected" : "unavailable",
        version: "1.0.0"
      });
    } catch (error: any) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });

  // ----------- Auth Routes -----------
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) return res.status(400).json({ error: "Username already exists" });

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, password: hashedPassword });

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 });

      res.status(201).json({ user: { id: user.id, username: user.username }, token });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });

      const user = await storage.getUserByUsername(username);
      if (!user || !user.password) return res.status(401).json({ error: "Invalid credentials" });

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 });

      res.json({ user: { id: user.id, username: user.username }, token });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      res.json({ user: { id: user.id, username: user.username } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    // Clear all cookies we can see on the request so logout reliably removes
    // any session/auth cookie (token, connect.sid, __session, Clerk, etc.).
    try {
      if (req && req.cookies) {
        Object.keys(req.cookies).forEach((name) => {
          try {
            res.clearCookie(name);
          } catch (e) {
            // ignore clearing errors for individual cookies
          }
        });
      }

      // Also attempt to clear some commonly-used cookie names just in case
      const common = ["token", "__session", "connect.sid", "__clerk_db_jwt", "__refresh_yi-xxomn"];
      common.forEach((name) => {
        try {
          res.clearCookie(name);
        } catch (e) {}
      });
    } catch (err) {
      // swallow errors - we'll still return success so client can reload and
      // re-check auth state
    }

    res.json({ success: true });
  });

  // ----------- Stats & Dashboard -----------
  app.get("/api/stats", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const scans = await storage.getUserScans(userId);
      const totalVulns = scans.reduce((sum, s) => sum + (s.totalVulnerabilities || 0), 0);
      const criticalCount = scans.reduce((sum, s) => sum + (s.criticalCount || 0), 0);

      const stats = { totalScans: scans.length, totalVulnerabilities: totalVulns, criticalCount };
      const lastScanTime = await getLastScanTime();

      res.json({ ...stats, lastScanTime });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/dashboard", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const scans = await storage.getUserScans(userId);
      const totalVulns = scans.reduce((sum, s) => sum + (s.totalVulnerabilities || 0), 0);
      const criticalCount = scans.reduce((sum, s) => sum + (s.criticalCount || 0), 0);

      const stats = { totalScans: scans.length, totalVulnerabilities: totalVulns, criticalCount };
      const lastScanTime = await getLastScanTime();
      const recentScans = scans.slice(0, 10);
      const weeklyData = getWeeklyData(recentScans);

      res.json({ stats: { ...stats, lastScanTime }, recentScans, weeklyData });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  // ----------- Scan Routes -----------
  app.get("/api/scans", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const scans = await storage.getUserScans(userId);
      res.json(scans);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scans" });
    }
  });

  app.get("/api/scans/recent", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const limit = parseInt(req.query.limit as string) || 5;
      const scans = await storage.getUserScans(userId);
      res.json(scans.slice(0, limit));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent scans" });
    }
  });

  app.get("/api/scans/:id", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const scan = await storage.getScan(req.params.id);
      if (!scan || scan.userId !== userId) return res.status(404).json({ error: "Scan not found" });

      const vulns = await storage.getVulnerabilitiesByScan(req.params.id);
      res.json({ ...scan, vulnerabilities: vulns });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scan" });
    }
  });

  app.post("/api/scans", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const parsed = insertScanSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid scan data", details: parsed.error });

      const scan = await storage.createScan({ ...parsed.data, userId });
      performScan(scan.id, parsed.data.targetUrl, parsed.data.scanType || "quick");
      res.status(201).json(scan);
    } catch (error) {
      res.status(500).json({ error: "Failed to create scan" });
    }
  });

  app.delete("/api/scans/:id", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const scan = await storage.getScan(req.params.id);
      if (!scan || scan.userId !== userId) return res.status(404).json({ error: "Scan not found" });

      await storage.deleteVulnerabilitiesByScan(req.params.id);
      await storage.deleteScan(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete scan" });
    }
  });

  // ----------- Vulnerabilities -----------
  app.get("/api/vulnerabilities", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const scans = await storage.getUserScans(userId);
      const allVulns: any[] = [];
      for (const scan of scans) {
        const vulns = await storage.getVulnerabilitiesByScan(scan.id);
        allVulns.push(...vulns.map(v => ({ ...v, targetUrl: scan.targetUrl })));
      }
      res.json(allVulns);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vulnerabilities" });
    }
  });

  // ----------- Scheduled Scans -----------
  app.get("/api/schedules", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const allSchedules = await storage.getAllScheduledScans();
      res.json(allSchedules.filter(s => s.userId === userId));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch schedules" });
    }
  });

  app.post("/api/schedules", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const parsed = insertScheduledScanSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid schedule data", details: parsed.error });

      const schedule = await storage.createScheduledScan({ ...parsed.data, userId } as any);
      res.status(201).json(schedule);
    } catch (error) {
      res.status(500).json({ error: "Failed to create schedule" });
    }
  });

  app.patch("/api/schedules/:id", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const parsed = insertScheduledScanSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid schedule data", details: parsed.error });

      const schedule = await storage.getScheduledScan(req.params.id);
      if (!schedule || schedule.userId !== userId) return res.status(404).json({ error: "Schedule not found" });

      const updated = await storage.updateScheduledScan(req.params.id, parsed.data);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  app.delete("/api/schedules/:id", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const schedule = await storage.getScheduledScan(req.params.id);
      if (!schedule || schedule.userId !== userId) return res.status(404).json({ error: "Schedule not found" });

      await storage.deleteScheduledScan(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete schedule" });
    }
  });

  // ----------- Settings -----------
  app.get("/api/settings", authenticateToken, async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json({ ...settings, apiKey: currentApiKey });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", authenticateToken, async (req, res) => {
    try {
      const parsed = insertSettingsSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid settings data", details: parsed.error });

      const settings = await storage.getSettings();
      if (!settings) return res.status(404).json({ error: "Settings not found" });

      const updated = await storage.updateSettings(settings.id, parsed.data);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.post("/api/settings/regenerate-key", authenticateToken, async (_req, res) => {
    try {
      currentApiKey = "zap_sk_" + Math.random().toString(36).substring(2, 18);
      res.json({ apiKey: currentApiKey });
    } catch (error) {
      res.status(500).json({ error: "Failed to regenerate API key" });
    }
  });

  // ----------- Reports -----------
  app.get("/api/reports", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const reports = await storage.getReportsByUser(userId);
      // return minimal report metadata to the client
      res.json(reports.map(r => ({
        id: r.id,
        userId: r.userId,
        scanId: (r as any).scanId || null,
        reportName: r.reportName,
        reportPath: r.reportPath,
        createdAt: r.createdAt,
        total: (r as any).total ?? 0,
        critical: (r as any).critical ?? 0,
        high: (r as any).high ?? 0,
        medium: (r as any).medium ?? 0,
        low: (r as any).low ?? 0,
      })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.delete("/api/reports/:id", authenticateToken, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      // Ensure the report belongs to the requesting user
      const reports = await storage.getReportsByUser(userId);
      const report = reports.find((r: any) => r.id === req.params.id);
      if (!report) return res.status(404).json({ error: "Report not found" });

      await storage.deleteReport(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  app.get("/api/reports/export/:scanId", authenticateToken, async (req, res) => {
    try {
      const scan = await storage.getScan(req.params.scanId);
      if (!scan) return res.status(404).json({ error: "Scan not found" });

      if (!(req as any).isApiKeyAuth) {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: "Not authenticated" });
        if (scan.userId !== userId) return res.status(403).json({ error: "Unauthorized: This report belongs to another user" });
      }

      const vulns = await storage.getVulnerabilitiesByScan(req.params.scanId);
      const format = req.query.format || "json";

      if (format === "json") {
        res.setHeader("Content-Disposition", `attachment; filename="scan-report-${scan.id}.json"`);
        res.json({
          report: {
            generatedAt: new Date().toISOString(),
            scan,
            vulnerabilities: vulns,
            summary: {
              total: vulns.length,
              critical: scan.criticalCount,
              high: scan.highCount,
              medium: scan.mediumCount,
              low: scan.lowCount,
            },
          },
        });
      } else {
        const html = generateHTMLReport(scan, vulns);
        res.setHeader("Content-Type", "text/html");
        res.setHeader("Content-Disposition", `attachment; filename="scan-report-${scan.id}.html"`);
        res.send(html);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to export report" });
    }
  });

  return httpServer;
}

// ================= Helpers =================
function getWeeklyData(scans: any[]) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekData = days.map(day => ({ day, scans: 0, vulnerabilities: 0 }));

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (const scan of scans) {
    if (scan.startedAt) {
      const scanDate = new Date(scan.startedAt);
      if (scanDate >= weekAgo) {
        const dayIndex = scanDate.getDay();
        weekData[dayIndex].scans++;
        weekData[dayIndex].vulnerabilities += scan.totalVulnerabilities || 0;
      }
    }
  }

  return [...weekData.slice(1), weekData[0]];
}

function escapeHtml(unsafe: any): string {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateHTMLReport(scan: any, vulnerabilities: any[]): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>ZAP Scan Report - ${escapeHtml(scan.targetUrl)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #1a1a1a; color: #fff; }
    .header { border-bottom: 2px solid #14b8a6; padding-bottom: 20px; margin-bottom: 30px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
    .stat { background: #2a2a2a; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 2em; font-weight: bold; color: #14b8a6; }
    .vuln { background: #2a2a2a; margin-bottom: 15px; padding: 20px; border-radius: 8px; border-left: 4px solid; }
    .critical { border-color: #dc2626; }
    .high { border-color: #ea580c; }
    .medium { border-color: #eab308; }
    .low { border-color: #14b8a6; }
    .severity { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .severity.critical { background: #dc2626; }
    .severity.high { background: #ea580c; }
    .severity.medium { background: #eab308; color: #000; }
    .severity.low { background: #14b8a6; }
    h1, h2, h3 { color: #14b8a6; }
  </style>
</head>
<body>
  <div class="header">
    <h1>ZAP Vulnerability Scan Report</h1>
    <p>Target: ${escapeHtml(scan.targetUrl)}</p>
    <p>Scan Type: ${escapeHtml(scan.scanType)}</p>
    <p>Completed: ${scan.completedAt ? new Date(scan.completedAt).toLocaleString() : 'N/A'}</p>
  </div>

  <div class="summary">
    <div class="stat"><div class="stat-value">${vulnerabilities.length}</div>Total</div>
    <div class="stat"><div class="stat-value" style="color:#dc2626">${scan.criticalCount || 0}</div>Critical</div>
    <div class="stat"><div class="stat-value" style="color:#ea580c">${scan.highCount || 0}</div>High</div>
    <div class="stat"><div class="stat-value" style="color:#eab308">${scan.mediumCount || 0}</div>Medium</div>
  </div>

  <h2>Vulnerabilities</h2>
  ${vulnerabilities.map(v => `
    <div class="vuln ${v.severity.toLowerCase()}">
      <span class="severity ${v.severity.toLowerCase()}">${v.severity}</span>
      <h3>${escapeHtml(v.title)}</h3>
      <p><strong>Type:</strong> ${escapeHtml(v.type)}</p>
      <p>${escapeHtml(v.description)}</p>
      <p><strong>Affected URL:</strong> ${escapeHtml(v.affectedUrl)}</p>
      <p><strong>Remediation:</strong> ${escapeHtml(v.remediation || 'N/A')}</p>
    </div>
  `).join('')}
</body>
</html>`;
}