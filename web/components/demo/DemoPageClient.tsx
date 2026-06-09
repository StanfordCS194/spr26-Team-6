"use client";

import { useEffect } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { ABTestToggle } from "../ABTestToggle";
import { DashboardMainGrid } from "../DashboardMainGrid";
import { DetailPanel } from "../DetailPanel";
import { GlobalHeader } from "../GlobalHeader";
import { ProfileDrawer } from "../ProfileDrawer";
import { ResizableSplitPane } from "../ResizableSplitPane";
import { RfpFeed } from "../RfpFeed";
import { SyncStatusBanner } from "../SyncStatusBanner";
import { Walkthrough } from "../Walkthrough/Walkthrough";
import { PortalHellPanel } from "./PortalHellPanel";

export function DemoPageClient() {
  const { toast, authReady, setDemoMode, setWalkthroughActive, setWalkthroughStep } =
    useDashboard();

  useEffect(() => {
    setDemoMode(true);
    setWalkthroughStep(0);
    setWalkthroughActive(true);
  }, [setDemoMode, setWalkthroughActive, setWalkthroughStep]);

  if (!authReady) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-govbid-surface px-6">
        <p className="text-sm font-medium text-govbid-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">
      <GlobalHeader />
      <SyncStatusBanner />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="hidden w-[min(38%,420px)] shrink-0 border-r border-govbid-border lg:block">
          <PortalHellPanel />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-govbid-surface">
          <DashboardMainGrid>
            <ResizableSplitPane
              className="min-h-0 min-w-0"
              defaultLeadingRatio={0.44}
              storageKey="govbid-demo-split"
              leading={
                <div className="flex min-h-0 min-w-0 flex-col">
                  <RfpFeed />
                </div>
              }
              trailing={
                <div className="flex min-h-[min(50vh,420px)] min-w-0 flex-col lg:min-h-0">
                  <DetailPanel />
                </div>
              }
            />
          </DashboardMainGrid>
        </div>
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
