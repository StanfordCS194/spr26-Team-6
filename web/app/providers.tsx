"use client";

import { PostHogProvider } from "@/components/PostHogProvider";
import { DashboardProvider } from "@/context/DashboardContext";
import { ABTestProvider } from "@/context/ABTestContext";
import { PostHogProvider } from "./posthog-provider";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PostHogProvider>
      <ABTestProvider>
        <DashboardProvider>
          <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">{children}</div>
        </DashboardProvider>
      </ABTestProvider>
    </PostHogProvider>
  );
}
