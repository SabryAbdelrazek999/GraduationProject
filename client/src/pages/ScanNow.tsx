import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Play, Loader2, Globe, Shield, Zap, CheckCircle, AlertTriangle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Scan } from "@shared/schema";

import { Progress } from "@/components/ui/progress";

export default function ScanNow() {
  const [url, setUrl] = useState("");
  const [scanType, setScanType] = useState("quick");
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const { toast } = useToast();

  const { data: recentScans } = useQuery<Scan[]>({
    queryKey: ["/api/scans/recent"],
  });

  const { data: activeScan, isLoading: scanLoading } = useQuery<Scan & { vulnerabilities: any[] }>({
    queryKey: ["/api/scans", activeScanId],
    enabled: !!activeScanId,
    refetchInterval: (data) => {
      const status = data?.state?.data?.status;
      if (status === "running" || status === "pending" || status === "cancelled") {
        return 1000; // Faster refresh when cancelling
      }
      return false;
    },
  });

  const scanMutation = useMutation({
    mutationFn: async (data: { targetUrl: string; scanType: string }) => {
      const response = await apiRequest("POST", "/api/scans", data);
      return response;
    },
    onSuccess: (scan: Scan) => {
      setActiveScanId(scan.id);
      queryClient.invalidateQueries({ queryKey: ["/api/scans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Scan Started",
        description: `Scanning ${url}...`,
      });
    },
    onError: () => {
      toast({
        title: "Scan Failed",
        description: "Failed to start the scan. Please try again.",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (scanId: string) => {
      try {
        const response = await apiRequest("POST", `/api/scans/${scanId}/cancel`, {});
        return response;
      } catch (error: any) {
        console.error("Cancel error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      setIsCanceling(false);
      queryClient.invalidateQueries({ queryKey: ["/api/scans", activeScanId] });
    },
    onError: (error: any) => {
      setIsCanceling(false);
      console.error("Mutation error:", error);
      toast({
        title: "Cancel Failed",
        description: error.message || "Failed to cancel the scan.",
        variant: "destructive",
      });
    },
  });

  const handleStartScan = () => {
    if (!url) {
      toast({
        title: "URL Required",
        description: "Please enter a valid URL to scan",
        variant: "destructive",
      });
      return;
    }

    let targetUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      targetUrl = "https://" + url;
    }

    scanMutation.mutate({ targetUrl, scanType });
  };

  const handleCancelScan = () => {
    if (activeScanId) {
      setIsCanceling(true);
      cancelMutation.mutate(activeScanId);
    }
  };

  const recentUrls = Array.from(new Set((recentScans || []).map(s => s.targetUrl))).slice(0, 5);
  const isScanning = scanMutation.isPending || (activeScan && (activeScan.status === "running" || activeScan.status === "pending"));

  return (
    <div className="p-6 space-y-6" data-testid="page-scan-now">
      <h1 className="text-2xl font-semibold text-foreground">Scan Now</h1>
      
      <Card className="bg-card border-card-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Start New Scan
          </CardTitle>
          <CardDescription>
            Enter the target URL and select scan type to begin vulnerability assessment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="target-url">Target URL</Label>
            <div className="flex gap-2">
              <Input
                id="target-url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 h-12"
                data-testid="input-target-url"
              />
              <Button
                onClick={handleStartScan}
                disabled={isScanning}
                className="h-12 px-6"
                data-testid="button-start-scan"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Scan
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scan-type">Scan Type</Label>
            <Select value={scanType} onValueChange={setScanType}>
              <SelectTrigger className="w-full md:w-64" data-testid="select-scan-type">
                <SelectValue placeholder="Select scan type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quick">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Quick Scan
                  </div>
                </SelectItem>
                <SelectItem value="deep">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Deep Scan
                  </div>
                </SelectItem>
                <SelectItem value="full">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Full Scan
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {recentUrls.length > 0 && (
            <div className="space-y-2">
              <Label>Recently Scanned</Label>
              <div className="flex flex-wrap gap-2">
                {recentUrls.map((recentUrl) => (
                  <Badge
                    key={recentUrl}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => setUrl(recentUrl)}
                    data-testid={`badge-recent-${recentUrl.replace(/[^a-z0-9]/gi, '-')}`}
                  >
                    {recentUrl}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {activeScan && (
        <Card className={`bg-card border-card-border ${activeScan.status === "running" || activeScan.status === "pending" || isCanceling ? "border-primary/50" : activeScan.status === "completed" ? "border-primary" : activeScan.status === "cancelled" ? "border-yellow-500/50" : "border-destructive"}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {activeScan.status === "running" || activeScan.status === "pending" ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : activeScan.status === "completed" ? (
                <CheckCircle className="w-5 h-5 text-primary" />
              ) : activeScan.status === "cancelled" || isCanceling ? (
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-destructive" />
              )}
              {isCanceling
                ? "Stopping Scan..."
                : activeScan.status === "running" || activeScan.status === "pending" 
                  ? "Scan in Progress" 
                  : activeScan.status === "completed" 
                    ? "Scan Completed"
                    : activeScan.status === "cancelled"
                      ? "Scan Cancelled"
                      : "Scan Failed"}
            </CardTitle>
            <CardDescription className="font-mono">{activeScan.targetUrl}</CardDescription>
          </CardHeader>
          <CardContent>
            {(activeScan.status === "running" || activeScan.status === "pending") && (
              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Progress</span>
                      <span>{activeScan.progress || 0}%</span>
                    </div>
                    <Progress value={activeScan.progress || 0} className="h-2" />
                  </div>
                  <Button
                    onClick={handleCancelScan}
                    disabled={isCanceling}
                    variant="destructive"
                    size="sm"
                    className="ml-4"
                  >
                    {isCanceling ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Stopping...
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 mr-2" />
                        Stop
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
            {activeScan.status === "completed" && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-md">
                  <p className="text-2xl font-bold text-foreground">{activeScan.totalVulnerabilities}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center p-3 bg-destructive/10 rounded-md">
                  <p className="text-2xl font-bold text-destructive">{activeScan.criticalCount}</p>
                  <p className="text-xs text-muted-foreground">Critical</p>
                </div>
                <div className="text-center p-3 bg-orange-500/10 rounded-md">
                  <p className="text-2xl font-bold text-orange-500">{activeScan.highCount}</p>
                  <p className="text-xs text-muted-foreground">High</p>
                </div>
                <div className="text-center p-3 bg-yellow-500/10 rounded-md">
                  <p className="text-2xl font-bold text-yellow-500">{activeScan.mediumCount}</p>
                  <p className="text-xs text-muted-foreground">Medium</p>
                </div>
                <div className="text-center p-3 bg-primary/10 rounded-md">
                  <p className="text-2xl font-bold text-primary">{activeScan.lowCount}</p>
                  <p className="text-xs text-muted-foreground">Low</p>
                </div>
              </div>
            )}
            {activeScan.status === "cancelled" && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
                <p className="text-yellow-600 font-medium">Scan has been cancelled.</p>
              </div>
            )}
            
            {activeScan.vulnerabilities && activeScan.vulnerabilities.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium text-foreground">Findings:</h4>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {activeScan.vulnerabilities.map((vuln: any, index: number) => (
                    <div 
                      key={index}
                      className="flex items-start gap-3 p-3 bg-muted/30 rounded-md border border-border"
                    >
                      <Badge 
                        variant={vuln.severity === "Critical" || vuln.severity === "High" ? "destructive" : "secondary"}
                        className="shrink-0"
                      >
                        {vuln.severity}
                      </Badge>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{vuln.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{vuln.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
