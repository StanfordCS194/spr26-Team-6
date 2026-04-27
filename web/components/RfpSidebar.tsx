"use client";

import { useDashboard } from "@/context/DashboardContext";
import { RfpCard } from "./RfpCard";

export function RfpSidebar() {
  const { filteredRfps, selectedRfpId, selectRfp } = useDashboard();

  return (
    <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Recommended RFPs
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Mock data — wire to SAM.gov + scoring pipeline later.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {filteredRfps.map((rfp) => (
            <RfpCard
              key={rfp.id}
              rfp={rfp}
              active={selectedRfpId === rfp.id}
              onSelect={() => selectRfp(rfp.id)}
            />
          ))}
          {filteredRfps.length === 0 && (
            <p className="px-1 text-sm text-zinc-500 dark:text-zinc-400">
              No RFPs match your search.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
