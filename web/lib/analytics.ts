import posthog from "posthog-js";

export type ListCardLayout = "score_first" | "headline_first";

/** RFP list card A/B: `score_first` (prominent match ring) vs `headline_first` (title/agency lead). */
export function getListCardLayout(): ListCardLayout {
  const v = process.env.NEXT_PUBLIC_LIST_CARD_LAYOUT?.toLowerCase();
  return v === "score_first" ? "score_first" : "headline_first";
}

function baseProps(): Record<string, string> {
  return { list_card_layout: getListCardLayout() };
}

let posthogInitialized = false;

type Queued =
  | { kind: "capture"; event: string; properties?: Record<string, unknown> }
  | {
      kind: "identify";
      distinctId: string;
      properties?: Record<string, unknown>;
    };

const queue: Queued[] = [];
const MAX_QUEUE = 100;

function flushQueue(): void {
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.kind === "capture") {
      try {
        posthog.capture(item.event, {
          ...baseProps(),
          ...item.properties,
        });
      } catch {
        /* ignore */
      }
    } else {
      try {
        posthog.identify(item.distinctId, {
          ...baseProps(),
          ...item.properties,
        });
      } catch {
        /* ignore */
      }
    }
  }
}

function enqueue(item: Queued): void {
  if (queue.length >= MAX_QUEUE) {
    queue.shift();
  }
  queue.push(item);
}

/** Initialize from explicit config (e.g. after /api/posthog-config fetch on Vercel). */
export function initPosthogWithConfig(
  apiKey: string,
  apiHost?: string | null,
): void {
  if (typeof window === "undefined") return;
  if (posthogInitialized) return;
  const trimmed = apiKey.trim();
  if (!trimmed) return;
  const host =
    (apiHost && apiHost.trim()) ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST ||
    "https://us.i.posthog.com";
  posthog.init(trimmed, {
    api_host: host,
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
  });
  posthogInitialized = true;
  flushQueue();
}

/** Initialize from NEXT_PUBLIC_* (build-time inlining; typical for local .env.local). */
export function initPosthog(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  initPosthogWithConfig(key, process.env.NEXT_PUBLIC_POSTHOG_HOST);
}

export function captureEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!posthogInitialized) {
    enqueue({ kind: "capture", event, properties });
    return;
  }
  try {
    posthog.capture(event, { ...baseProps(), ...properties });
  } catch {
    /* ignore analytics errors */
  }
}

export function identifySessionUser(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!posthogInitialized) {
    enqueue({ kind: "identify", distinctId, properties });
    return;
  }
  try {
    posthog.identify(distinctId, {
      ...baseProps(),
      ...properties,
    });
  } catch {
    /* ignore */
  }
}

export function resetPosthog(): void {
  if (typeof window === "undefined") return;
  if (!posthogInitialized) return;
  queue.length = 0;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}
