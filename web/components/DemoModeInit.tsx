"use client";

import { useEffect } from "react";
import { useDashboard } from "@/context/DashboardContext";

/** Reads `?demo=1` on the main dashboard and enables demo theater mode. */
export function DemoModeInit() {
  const {
    setDemoMode,
    setWalkthroughActive,
    setWalkthroughStep,
    demoMode,
  } = useDashboard();

  useEffect(() => {
    if (demoMode) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") !== "1") return;
    setDemoMode(true);
    setWalkthroughStep(0);
    setWalkthroughActive(true);
  }, [
    demoMode,
    setDemoMode,
    setWalkthroughActive,
    setWalkthroughStep,
  ]);

  return null;
}
