import { NextResponse } from "next/server";
import { z } from "zod";
import { scoreContractorAgainstRfp } from "@/lib/server/scoring";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  rfp_id: z.string().uuid(),
  contractor_id: z.string().uuid(),
  force: z.boolean().optional(),
});

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Scoring requires OPENAI_API_KEY (embeddings + LLM judges)." },
      { status: 503 },
    );
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfiguration.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { rfp_id, contractor_id, force } = parsed.data;

  // Confirm the contractor belongs to the calling user (RLS-safe).
  const { data: owned } = await supabase
    .from("contractors")
    .select("id, updated_at")
    .eq("id", contractor_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json(
      { error: "Contractor not found for this account." },
      { status: 403 },
    );
  }

  // Cache: return the existing score if it was computed after the contractor
  // profile was last updated. `force: true` bypasses the cache.
  if (!force) {
    const { data: cached } = await admin
      .from("scores")
      .select("*")
      .eq("contractor_id", contractor_id)
      .eq("rfp_id", rfp_id)
      .maybeSingle();
    if (
      cached &&
      new Date(cached.computed_at).getTime() >=
        new Date(owned.updated_at).getTime()
    ) {
      return NextResponse.json({
        cached: true,
        score: Number(cached.score),
        reasoning: cached.reasoning,
        factors: cached.factors,
      });
    }
  }

  try {
    const result = await scoreContractorAgainstRfp(
      admin,
      contractor_id,
      rfp_id,
    );
    return NextResponse.json({
      cached: false,
      score: result.total,
      reasoning: result.reasoning,
      factors: {
        total: result.total,
        weights: result.weights,
        factors: result.factors,
        null_factors: result.null_factors,
        model_version: result.model_version,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scoring failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
