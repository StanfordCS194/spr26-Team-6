import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { buildStructuredSummary, summaryCacheMetadata } from "@/lib/summary";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ rfpId: string }> },
) {
  const { rfpId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: cached } = await supabase
    .from("rfp_summaries")
    .select("summary")
    .eq("rfp_id", rfpId)
    .eq("summary_type", summaryCacheMetadata.summaryType)
    .eq("prompt_version", summaryCacheMetadata.promptVersion)
    .maybeSingle();
  if (cached?.summary) {
    return NextResponse.json({ summary: cached.summary, cached: true });
  }

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .select("*")
    .eq("id", rfpId)
    .single();
  if (rfpError || !rfp) {
    return NextResponse.json(
      { error: rfpError?.message ?? "RFP not found" },
      { status: 404 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Server summary generation is not configured." },
      { status: 500 },
    );
  }

  const summary = buildStructuredSummary(rfp);
  const service = createServiceClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
  const { error: writeError } = await service.from("rfp_summaries").upsert(
    {
      rfp_id: rfpId,
      summary,
      summary_type: summaryCacheMetadata.summaryType,
      prompt_version: summaryCacheMetadata.promptVersion,
      model: summaryCacheMetadata.model,
    },
    { onConflict: "rfp_id,summary_type,prompt_version" },
  );

  if (writeError) {
    return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  return NextResponse.json({ summary, cached: false });
}
