"use client";

import { DashboardProvider } from "@/context/DashboardContext";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <DashboardProvider>{children}</DashboardProvider>;
}
