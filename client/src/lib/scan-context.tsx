import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Scan } from "@shared/schema";

interface ScanContextType {
  activeScanId: string | null;
  setActiveScanId: (id: string | null) => void;
  activeScan: (Scan & { vulnerabilities: any[] }) | undefined;
  isScanning: boolean;
  isCanceling: boolean;
  setIsCanceling: (value: boolean) => void;
  estimatedRemainingSeconds?: number | null;
  formattedETA?: string | null;
  displayedProgress: number;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [progressSamples, setProgressSamples] = useState<Array<{ t: number; p: number }>>([]);
  const [displayedProgress, setDisplayedProgress] = useState<number>(0);

  const { data: activeScan } = useQuery<Scan & { vulnerabilities: any[] }>({
    queryKey: ["/api/scans", activeScanId],
    enabled: !!activeScanId,
    // keep polling while there's an active scan so progress updates even when user navigates away
    refetchInterval: (data) => {
      if (!activeScanId) return false;
      // poll every second while there is an active scan id
      return 1000;
    },
  });

  // Maintain recent progress samples to compute ETA
  useEffect(() => {
    if (!activeScan) return;
    const p = typeof (activeScan as any).progress === "number" ? (activeScan as any).progress : null;
    if (p === null || p === undefined) return;
    const t = Date.now();
    setProgressSamples((s) => {
      const next = [...s, { t, p }];
      // keep last 6 samples (~6 seconds)
      return next.slice(-6);
    });
  }, [activeScan?.progress]);

  // Smoothly animate displayedProgress toward activeScan.progress
  useEffect(() => {
    const target = typeof (activeScan as any)?.progress === "number" ? (activeScan as any).progress : 0;
    // Never decrease displayedProgress, only increase it
    if (displayedProgress >= target) {
      return; // Don't animate backwards
    }

    let cancelled = false;
    const stepMs = 150; // time between visual increments
    const handle = setInterval(() => {
      setDisplayedProgress((cur) => {
        if (cancelled) return cur;
        if (cur >= target) {
          clearInterval(handle);
          return target;
        }
        return cur + 1; // increment visually by 1%
      });
    }, stepMs);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [activeScan?.progress]);

  const estimatedRemainingSeconds = (() => {
    const samples = progressSamples;
    if (samples.length < 2) return null;
    // compute rate using oldest -> newest
    const first = samples[0];
    const last = samples[samples.length - 1];
    const deltaP = last.p - first.p;
    const deltaT = (last.t - first.t) / 1000; // seconds
    if (deltaT <= 0 || deltaP <= 0) return null;
    const rate = deltaP / deltaT; // percent per second
    const remainingPct = Math.max(0, 100 - (last.p || 0));
    const seconds = remainingPct / rate;
    if (!isFinite(seconds) || seconds < 0) return null;
    return Math.round(seconds);
  })();

  const isScanning = activeScan && (activeScan.status === "running" || activeScan.status === "pending");
  const formattedETA = (() => {
    if (!estimatedRemainingSeconds) return null;
    const sec = estimatedRemainingSeconds;
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  })();

  return (
    <ScanContext.Provider
      value={{
        activeScanId,
        setActiveScanId,
        activeScan,
        isScanning: !!isScanning,
        isCanceling,
        setIsCanceling,
        estimatedRemainingSeconds,
        formattedETA,
        displayedProgress,
      }}
    >
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  const context = useContext(ScanContext);
  if (!context) {
    throw new Error("useScan must be used within ScanProvider");
  }
  return context;
}
