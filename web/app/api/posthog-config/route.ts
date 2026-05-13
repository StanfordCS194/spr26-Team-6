import { NextResponse } from "next/server";

/**
 * Returns PostHog project settings for browser init.
 * Prefer POSTHOG_PROJECT_API_KEY on Vercel so the token is read at **request runtime**
 * (Preview env) instead of only at Next.js **build** time (NEXT_PUBLIC_*).
 */
export async function GET() {
  const apiKey =
    process.env.POSTHOG_PROJECT_API_KEY ??
    process.env.POSTHOG_KEY ??
    process.env.NEXT_PUBLIC_POSTHOG_KEY ??
    null;
  const apiHost =
    process.env.POSTHOG_API_HOST ??
    process.env.NEXT_PUBLIC_POSTHOG_HOST ??
    null;

  return NextResponse.json(
    { apiKey, apiHost },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
