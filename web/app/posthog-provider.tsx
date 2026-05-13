"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { useEffect, type ReactNode } from "react";

// Initialize PostHog only once on the client
if (typeof window !== "undefined") {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      person_profiles: "identified_only",
      capture_pageview: false, // We'll handle this manually for better control
      capture_pageleave: true,
    });
  }
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  return <PHProvider client={posthog}>{children}</PHProvider>;
}

// Hook to track page views with variant context
export function useTrackPageView(variantContext?: Record<string, string>) {
  const posthogClient = usePostHog();

  useEffect(() => {
    if (posthogClient) {
      posthogClient.capture("$pageview", {
        ...variantContext,
      });
    }
  }, [posthogClient, variantContext]);
}

// Helper to track A/B test events
export function trackABTestEvent(
  eventName: string,
  properties?: Record<string, unknown>
) {
  if (typeof window !== "undefined" && posthog) {
    posthog.capture(eventName, properties);
  }
}
