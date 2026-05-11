"use client";

import { useDashboard } from "@/context/DashboardContext";
import { DetailPanel } from "./DetailPanel";
import { GlobalHeader } from "./GlobalHeader";
import { ProfileDrawer } from "./ProfileDrawer";
import { RfpFeed } from "./RfpFeed";
import { RfpSidebar } from "./RfpSidebar";
import { Walkthrough } from "./Walkthrough/Walkthrough";

export function Dashboard() {
  const { toast, authReady } = useDashboard();

  if (!authReady) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-govbid-surface px-6">
        <p className="text-sm font-medium text-govbid-text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-govbid-surface">
        <GlobalHeader />

        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <RfpSidebar />

          <div className="grid min-h-0 min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-h-0 min-w-0 flex-col">
              <RfpFeed />
            </div>

            <div className="flex min-h-[min(50vh,420px)] min-w-0 flex-col lg:min-h-0">
              <DetailPanel />
            </div>
          </div>
        </div>
      </div>

      <ProfileDrawer />
      <Walkthrough />
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[60] max-w-md -translate-x-1/2 rounded-xl border border-govbid-border bg-govbid-surface px-4 py-3 text-sm font-medium text-govbid-text shadow-[var(--govbid-shadow)]"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
