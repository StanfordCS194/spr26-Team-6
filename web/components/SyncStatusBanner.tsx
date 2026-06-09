"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import {
  distinctSourceCount,
  countBySource,
  formatSourceBreakdown,
} from "@/lib/rfpSource";

const SYNC_LABELS = [
  "Cal eProcure",
  "BidNet",
  "PlanetBids",
  "SAM.gov",
] as const;

type Phase = "syncing" | "ready" | "hidden";

export function SyncStatusBanner() {
  const { loadedRfps, demoMode } = useDashboard();
  const [phase, setPhase] = useState<Phase>("hidden");
  const [syncIndex, setSyncIndex] = useState(0);

  useEffect(() => {
    if (!demoMode) {
      setPhase("hidden");
      return;
    }
    setPhase("syncing");
    setSyncIndex(0);
    const tick = window.setInterval(() => {
      setSyncIndex((i) => (i + 1) % SYNC_LABELS.length);
    }, 650);
    const done = window.setTimeout(() => {
      window.clearInterval(tick);
      setPhase("ready");
    }, 2600);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
    };
  }, [demoMode]);

  if (phase === "hidden") return null;

  const counts = countBySource(loadedRfps);
  const sourceN = distinctSourceCount(counts);
  const total = loadedRfps.length;

  if (phase === "syncing") {
    return (
      <div
        role="status"
        className="flex shrink-0 items-center gap-2 border-b border-govbid-primary/20 bg-govbid-primary-muted/40 px-4 py-2 text-xs font-medium text-govbid-primary md:px-6"
      >
        <span
          className="inline-block size-3.5 animate-spin rounded-full border-2 border-govbid-primary/30 border-t-govbid-primary"
          aria-hidden
        />
        <span>
          Syncing from {SYNC_LABELS[syncIndex]}…
        </span>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-xs text-emerald-900 md:px-6">
      <span className="font-semibold">
        {total} opportunit{total === 1 ? "y" : "ies"} · {sourceN} source
        {sourceN === 1 ? "" : "s"} unified
      </span>
      {total > 0 && (
        <span className="text-emerald-800/80">{formatSourceBreakdown(counts)}</span>
      )}
    </div>
  );
}
