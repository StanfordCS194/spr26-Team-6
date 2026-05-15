import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import type {
  CompatibilityFactors,
  CompatibilityScore,
  ScoreFactorName,
} from "@/lib/types";
import {
  ensurePastProjectsEmbedded,
  ensureRfpChunksEmbedded,
} from "@/lib/server/ragPipeline";
import { scoreAward } from "./award";
import { scoreExperience } from "./experience";
import { scoreGoals } from "./goals";
import { scorePrereqs } from "./prereqs";
import { buildReasoningPrompt, SCORING_PROMPTS } from "./prompts";
import { scoreTiming } from "./timing";
import { renormalizeWeights, weightedTotal } from "./weights";

type AdminClient = SupabaseClient<Database>;

const MODEL_VERSION = "compat-v1";

export type ScoringResult = CompatibilityScore & {
  reasoning: string;
};

/**
 * Compute the 5-factor compatibility score for one (contractor, RFP) pair and
 * upsert it into `scores`. Requires the service-role client because the embed-
 * on-demand step writes to `rfp_chunks` / `contractor_past_projects.embedding`.
 */
export async function scoreContractorAgainstRfp(
  admin: AdminClient,
  contractorId: string,
  rfpId: string,
): Promise<ScoringResult> {
  const { data: contractor, error: cErr } = await admin
    .from("contractors")
    .select("*")
    .eq("id", contractorId)
    .maybeSingle();
  if (cErr || !contractor) {
    throw new Error(cErr?.message ?? "Contractor not found.");
  }

  const { data: rfp, error: rErr } = await admin
    .from("rfps")
    .select("*")
    .eq("id", rfpId)
    .maybeSingle();
  if (rErr || !rfp) {
    throw new Error(rErr?.message ?? "RFP not found.");
  }

  const { data: pastProjects } = await admin
    .from("contractor_past_projects")
    .select("*")
    .eq("contractor_id", contractorId);

  // Make sure both sides have embeddings before similarity-based factors run.
  await ensureRfpChunksEmbedded(admin, {
    id: rfp.id,
    title: rfp.title,
    description: rfp.description,
  });
  await ensurePastProjectsEmbedded(admin, contractorId);

  const timing = scoreTiming({
    dueDate: rfp.due_date,
    preferredResponseWindowDays: contractor.preferred_response_window_days,
  });

  const award = scoreAward({
    contractorMin: contractor.preferred_contract_min,
    contractorMax: contractor.preferred_contract_max,
    rfpMin: rfp.contract_amount_min,
    rfpMax: rfp.contract_amount_max,
  });

  const [experience, goals, prereqs] = await Promise.all([
    scoreExperience(admin, {
      rfpId: rfp.id,
      contractorId: contractor.id,
      rfpTitle: rfp.title,
    }),
    scoreGoals(admin, {
      rfpId: rfp.id,
      rfpTitle: rfp.title,
      rfpDescription: rfp.description,
      goals: contractor.goals,
    }),
    scorePrereqs({
      contractor: {
        certifications: contractor.certifications,
        set_aside_eligibility: contractor.set_aside_eligibility,
        naics_codes: contractor.naics_codes,
        industries: contractor.industries,
        sub_industries: contractor.sub_industries,
      },
      rfp: { title: rfp.title, description: rfp.description, metadata: rfp.metadata },
      pastProjects: pastProjects ?? [],
    }),
  ]);

  const nullFactors: ScoreFactorName[] = [];
  if (timing.isNull) nullFactors.push("timing");
  if (award.isNull) nullFactors.push("award");
  if (experience.isNull) nullFactors.push("experience");
  if (goals.isNull) nullFactors.push("goals");
  if (prereqs.isNull) nullFactors.push("prereqs");

  const weights = renormalizeWeights(nullFactors);

  // Normalize each factor's score onto 0–1 for the weighted sum.
  const normalized: Record<ScoreFactorName, number> = {
    timing: timing.factor.score, // already 0 or 1
    award: award.factor.score, // 0 / 0.5 / 1
    experience: experience.factor.score / 100,
    goals: goals.factor.score / 100,
    prereqs: prereqs.factor.score / 100,
  };

  const total = weightedTotal(normalized, weights);

  const factors: CompatibilityFactors = {
    timing: timing.factor,
    experience: experience.factor,
    goals: goals.factor,
    award: award.factor,
    prereqs: prereqs.factor,
  };

  const reasoning = await generateReasoning({
    total,
    rfpTitle: rfp.title,
    companyName: contractor.company_name,
    factors,
  });

  const breakdown: CompatibilityScore = {
    total,
    weights,
    factors,
    null_factors: nullFactors,
    model_version: MODEL_VERSION,
  };

  await upsertScore(admin, contractorId, rfpId, total, reasoning, breakdown);

  return { ...breakdown, reasoning };
}

async function generateReasoning(args: {
  total: number;
  rfpTitle: string;
  companyName: string;
  factors: CompatibilityFactors;
}): Promise<string> {
  const perFactor = (
    Object.entries(args.factors) as [
      ScoreFactorName,
      CompatibilityFactors[ScoreFactorName],
    ][]
  ).map(([name, f]) => ({
    name,
    score: f.score,
    reason: f.reason,
  }));

  try {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: SCORING_PROMPTS.reasoningSystem,
      prompt: buildReasoningPrompt({
        total: args.total,
        rfpTitle: args.rfpTitle,
        companyName: args.companyName,
        perFactor,
      }),
    });
    return text.trim();
  } catch {
    // Degrade gracefully — caller still gets the structured breakdown.
    return `Compatibility ${args.total}/100. ${perFactor
      .map((f) => `${f.name}: ${f.score}`)
      .join("; ")}.`;
  }
}

async function upsertScore(
  admin: AdminClient,
  contractorId: string,
  rfpId: string,
  total: number,
  reasoning: string,
  breakdown: CompatibilityScore,
): Promise<void> {
  const { error } = await admin.from("scores").upsert(
    {
      contractor_id: contractorId,
      rfp_id: rfpId,
      score: total,
      reasoning,
      factors: breakdown as unknown as Json,
      model_version: breakdown.model_version,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "contractor_id,rfp_id" },
  );
  if (error) {
    throw new Error(`Failed to cache score: ${error.message}`);
  }
}
