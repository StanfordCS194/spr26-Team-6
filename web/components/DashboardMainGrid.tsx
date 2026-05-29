"use client";

import type { ReactNode } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { RfpSidebar } from "./RfpSidebar";

export function DashboardMainGrid({ children }: { children: ReactNode }) {
  const { filtersPanelVisible } = useDashboard();

  return (
    <div
      className={`grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden ${
        filtersPanelVisible
          ? "lg:grid-cols-[280px_minmax(0,1fr)]"
          : "lg:grid-cols-[auto_minmax(0,1fr)]"
      }`}
    >
      <div className="min-h-0 overflow-y-auto overflow-x-hidden">
        <RfpSidebar />
      </div>
      <div
        id="walkthrough-dashboard-scroll-area"
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
      >
        {children}
      </div>
    </div>
  );
}
