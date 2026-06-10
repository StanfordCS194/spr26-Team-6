"use client";

import { PostHogProvider } from "@/components/PostHogProvider";
import { DashboardProvider } from "@/context/DashboardContext";
import { ABTestProvider } from "@/context/ABTestContext";
import { NotificationProvider } from "@/context/NotificationContext";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PostHogProvider>
      <ABTestProvider>
        <DashboardProvider>
          <NotificationProvider>
            <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
              {children}
            </div>
          </NotificationProvider>
        </DashboardProvider>
      </ABTestProvider>
    </PostHogProvider>
  );
}
