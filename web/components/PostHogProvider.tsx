"use client";

import {
  initPosthog,
  initPosthogWithConfig,
} from "@/lib/analytics";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect, type ReactNode } from "react";

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      initPosthog();
      return;
    }

    void (async () => {
      try {
        const res = await fetch("/api/posthog-config", { cache: "no-store" });
        const data = (await res.json()) as {
          apiKey: string | null;
          apiHost: string | null;
        };
        if (data.apiKey) {
          initPosthogWithConfig(data.apiKey, data.apiHost);
        } else {
          console.warn(
            "[GovBid/PostHog] No project key in this deployment. Set NEXT_PUBLIC_POSTHOG_KEY (build-time) or POSTHOG_PROJECT_API_KEY (runtime, server-only) for Preview in Vercel, then redeploy.",
          );
        }
      } catch (e) {
        console.warn("[GovBid/PostHog] Failed to load /api/posthog-config", e);
      }
    })();
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
