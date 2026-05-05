"use client";

import { DashboardProvider } from "@/context/DashboardContext";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">{children}</div>
    </DashboardProvider>
  );
}
