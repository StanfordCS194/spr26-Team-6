import type { NextRequest } from "next/server";

import { SummaryRequestSchema } from "@/lib/rfpSummary";
import {
  deleteStaleSummaries,
  generateSummary,
  loadRfpContext,
  storeSummary,
} from "@/lib/server/summaryGenerate";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsedBody = SummaryRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Invalid request body.",
        details: parsedBody.error.flatten(),
      },
      { status: 400 }
    );
  }
  let { rfpText, rfpTitle } = parsedBody.data;
  const { rfpId } = parsedBody.data;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let cacheTarget: { rfpId: string; admin: ReturnType<typeof createServiceRoleClient> } | null = null;

  if (rfpId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    let admin: ReturnType<typeof createServiceRoleClient>;
    try {
      admin = createServiceRoleClient();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Server misconfiguration.";
      return Response.json(
        {
          error:
            `${message}. Regenerating summaries requires a server-only Supabase secret so the result can be saved.`,
        },
        { status: 503 },
      );
    }
    cacheTarget = { rfpId, admin };

    await deleteStaleSummaries(admin, rfpId);

    try {
      const { title, context } = await loadRfpContext(admin, rfpId);
      rfpTitle = title ?? undefined;
      rfpText = context;
    } catch (err) {
      const message = err instanceof Error ? err.message : "RFP not found.";
      return Response.json(
        { error: message },
        { status: message === "RFP not found." ? 404 : 502 },
      );
    }
  }

  if (!rfpText?.trim()) {
    return Response.json(
      { error: "No RFP text was available for summary generation." },
      { status: 400 },
    );
  }

  try {
    const summary = await generateSummary(apiKey, rfpTitle, rfpText);

    if (cacheTarget) {
      try {
        await storeSummary(cacheTarget.admin, cacheTarget.rfpId, summary);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 502 });
      }
    }

    return Response.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
