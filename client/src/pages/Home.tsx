import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileText, ShieldAlert, Clock } from "lucide-react";
import StatCard from "@/components/StatCard";
import ActivityTable from "@/components/ActivityTable";
import { Skeleton } from "@/components/ui/skeleton";
import type { Scan } from "@shared/schema";

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalScans: number;
    totalVulnerabilities: number;
    criticalCount: number;
    lastScanTime: string;
  }>({
    queryKey: ["/api/stats"],
  });

  const { data: recentScans, isLoading: scansLoading } = useQuery<Scan[]>({
    queryKey: ["/api/scans/recent"],
  });

  const [, setLocation] = useLocation();

  const handleViewDetails = (type: string) => {
    if (type === "total-scans" || type === "vulnerabilities") {
      setLocation("/dashboard");
    } else if (type === "last-scan") {
      setLocation("/reports");
    }
  };

  const handleViewSource = (id: string) => {
    setLocation(`/scans/${id}`);
  };

  if (statsLoading || scansLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="page-home">
        <h1 className="text-2xl font-semibold text-foreground">Welcome Home</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-home">
      <h1 className="text-2xl font-semibold text-foreground">Welcome Home</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={FileText}
          title="Total Scans"
          value={stats?.totalScans || 0}
          subtitle="Lead Developer"
          onViewDetails={() => handleViewDetails("total-scans")}
        />
        <StatCard
          icon={ShieldAlert}
          title="Critical Vulnerabilities"
          value={stats?.criticalCount || 0}
          subtitle="Security Researcher"
          onViewDetails={() => handleViewDetails("vulnerabilities")}
        />
        <StatCard
          icon={Clock}
          title="Last Scan"
          value={stats?.lastScanTime || "Never"}
          subtitle={stats?.lastScanTime || "No scans yet"}
          onViewDetails={() => handleViewDetails("last-scan")}
        />
      </div>

      <ActivityTable activities={recentScans || []} onViewSource={handleViewSource} />
    </div>
  );
}
