"use client";

import { useDashboard } from "@/context/DashboardContext";
import { useABTest } from "@/context/ABTestContext";
import { ABTestToggle } from "./ABTestToggle";
import { DetailPanel } from "./DetailPanel";
import { DetailPanelVariantB } from "./DetailPanelVariantB";
import { DashboardVariantB } from "./DashboardVariantB";
import { GlobalHeader } from "./GlobalHeader";
import { ProfileDrawer } from "./ProfileDrawer";
import { ResizableSplitPane } from "./ResizableSplitPane";
import { DashboardMainGrid } from "./DashboardMainGrid";
import { RfpFeed } from "./RfpFeed";
import { Walkthrough } from "./Walkthrough/Walkthrough";
import { DemoModeInit } from "./DemoModeInit";
import { SyncStatusBanner } from "./SyncStatusBanner";

export function Dashboard() {
  const { toast, authReady } = useDashboard();
  const { dashboardVariant, detailPanelVariant } = useABTest();

  if (!authReady) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-govbid-surface px-6">
        <p className="text-sm font-medium text-govbid-text-muted">Loading...</p>
      </div>
    );
  }

  // Render Dashboard Variant B if selected
  if (dashboardVariant === "B") {
    return (
      <>
        <DashboardVariantB />
        <ABTestToggle />
      </>
    );
  }

  // Default: Dashboard Variant A
  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">
      <DemoModeInit />
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-govbid-surface">
        <GlobalHeader />
        <SyncStatusBanner />

        <DashboardMainGrid>
          <ResizableSplitPane
            className="min-h-0 min-w-0"
            defaultLeadingRatio={0.44}
            storageKey="govbid-dashboard-split-a"
            leading={
              <div className="flex min-h-0 min-w-0 flex-col">
                <RfpFeed />
              </div>
            }
            trailing={
              <div className="flex min-h-[min(50vh,420px)] min-w-0 flex-col lg:min-h-0">
                {detailPanelVariant === "B" ? (
                  <DetailPanelVariantB />
                ) : (
                  <DetailPanel />
                )}
              </div>
            }
          />
        </DashboardMainGrid>
      </div>

      <ProfileDrawer />
      <Walkthrough />
      <ABTestToggle />
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
