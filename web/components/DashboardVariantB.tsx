"use client";

import { useDashboard } from "@/context/DashboardContext";
import { useABTest } from "@/context/ABTestContext";
import { DetailPanel } from "./DetailPanel";
import { DetailPanelVariantB } from "./DetailPanelVariantB";
import { GlobalHeader } from "./GlobalHeader";
import { ProfileDrawer } from "./ProfileDrawer";
import { ResizableSplitPane } from "./ResizableSplitPane";
import { DashboardMainGrid } from "./DashboardMainGrid";
import { RfpFeed } from "./RfpFeed";
import { Walkthrough } from "./Walkthrough/Walkthrough";

/**
 * Dashboard Variant B - Reversed Layout
 * 
 * Key differences from Variant A:
 * - DetailPanel appears on the LEFT side
 * - RfpFeed appears on the RIGHT side
 * - This layout prioritizes the detail view, making it more prominent
 */
export function DashboardVariantB() {
  const { toast, authReady } = useDashboard();
  const { detailPanelVariant } = useABTest();

  if (!authReady) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-govbid-surface px-6">
        <p className="text-sm font-medium text-govbid-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-govbid-surface">
        <GlobalHeader />

        <DashboardMainGrid>
          <ResizableSplitPane
            className="min-h-0 min-w-0"
            defaultLeadingRatio={0.6}
            storageKey="govbid-dashboard-split-b"
            leading={
              <div className="order-2 flex min-h-[min(50vh,420px)] min-w-0 flex-1 flex-col lg:order-none lg:h-full lg:min-h-0">
                {detailPanelVariant === "B" ? (
                  <DetailPanelVariantB />
                ) : (
                  <DetailPanel />
                )}
              </div>
            }
            trailing={
              <div className="order-1 flex h-full min-h-0 min-w-0 flex-1 flex-col lg:order-none">
                <RfpFeed />
              </div>
            }
          />
        </DashboardMainGrid>
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
