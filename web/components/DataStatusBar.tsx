"use client";

import { useDashboard } from "@/context/DashboardContext";

export function DataStatusBar() {
  const {
    workspaceLoading,
    workspaceStatusLine,
    refetchWorkspace,
    loadedRfps,
    filteredRfps,
  } = useDashboard();

  if (!workspaceStatusLine && !workspaceLoading) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-govbid-border bg-govbid-elevated px-4 py-2 text-xs text-govbid-text-muted md:px-6">
      {workspaceLoading ? (
        <span className="font-medium text-govbid-text">
          {workspaceStatusLine ?? "Refreshing data…"}
        </span>
      ) : (
        <>
          <span className="max-w-[min(100%,52rem)] leading-snug">
            {workspaceStatusLine}
          </span>
          <span className="hidden text-govbid-text-muted sm:inline" aria-hidden>
            ·
          </span>
          <span className="tabular-nums">
            Catalog {loadedRfps.length} · after filters {filteredRfps.length}
          </span>
        </>
      )}
      <button
        type="button"
        disabled={workspaceLoading}
        onClick={() => void refetchWorkspace()}
        className="ml-auto rounded-md border border-govbid-border bg-govbid-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-govbid-text transition hover:bg-govbid-primary-muted/50 disabled:opacity-50"
      >
        Refresh pull
      </button>
    </div>
  );
}
