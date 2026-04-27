"use client";

import { useDashboard } from "@/context/DashboardContext";
import { DetailPanel } from "./DetailPanel";
import { GlobalHeader } from "./GlobalHeader";
import { ProfileDrawer } from "./ProfileDrawer";
import { RfpSidebar } from "./RfpSidebar";

export function Dashboard() {
  const { toast } = useDashboard();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-100 dark:bg-zinc-950">
      <GlobalHeader />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(260px,30%)_1fr]">
        <RfpSidebar />
        <DetailPanel />
      </div>
      <ProfileDrawer />
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[60] max-w-md -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
