"use client";

import { useDashboard } from "@/context/DashboardContext";
import { RfpCard } from "./RfpCard";

export function RfpFeed() {
  const { feedRfps, selectedRfpId, selectRfp, activeNav } = useDashboard();

  if (activeNav === "history") {
    return (
      <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-2 bg-govbid-surface px-6 py-12 text-center">
        <p className="max-w-sm text-sm font-medium text-govbid-text">History</p>
        <p className="max-w-sm text-sm text-govbid-text-muted">
          Recently viewed RFPs will appear here once session tracking is connected.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-govbid-surface p-4 lg:gap-4 lg:p-5">
      {feedRfps.map((rfp) => (
        <RfpCard
          key={rfp.id}
          rfp={rfp}
          active={selectedRfpId === rfp.id}
          onSelect={() => selectRfp(rfp.id)}
        />
      ))}
      {feedRfps.length === 0 && (
        <p className="rounded-xl border border-dashed border-govbid-border bg-govbid-surface/80 px-4 py-10 text-center text-sm text-govbid-text-muted">
          {activeNav === "saved"
            ? "No saved opportunities match these filters. Save RFPs from the detail view or clear filters."
            : "No RFPs match your search. Try different keywords or filters."}
        </p>
      )}
    </div>
  );
}
