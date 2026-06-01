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
import { scoreAgency } from "./agency";
import { checkExclusions } from "./exclusions";
import { scoreExperience } from "./experience";
import { scoreGeography } from "./geography";
import { scoreGoals } from "./goals";
import { scoreKeywords } from "./keywords";
import { scorePrereqs } from "./prereqs";
import { buildReasoningPrompt, SCORING_PROMPTS } from "./prompts";
import { scoreTiming } from "./timing";
import { renormalizeWeights, weightedTotal } from "./weights";

type AdminClient = SupabaseClient<Database>;

const MODEL_VERSION = "compat-v2";

export type ScoringResult = CompatibilityScore & {
  reasoning: string;
};

/**
 * Compute the 8-factor compatibility score for one (contractor, RFP) pair and
 * upsert it into `scores`. Requires the service-role client because the embed-
 * on-demand step writes to `rfp_chunks` / `contractor_past_projects.embedding`.
 *
 * If a contractor exclusion term matches the RFP text, the total is forced to
 * 0 and the breakdown carries an `excluded` field — factor sub-scores are
 * still computed and stored for transparency.
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

  // Hard-zero gate: if an exclusion term matches the RFP, short-circuit the
  // expensive LLM judges and return 0.
  const exclusion = checkExclusions({
    exclusions: contractor.exclusions,
    rfpTitle: rfp.title,
    rfpDescription: rfp.description,
    rfpTags: rfp.tags,
  });

  // Make sure both sides have embeddings before similarity-based factors run.
  await ensureRfpChunksEmbedded(admin, {
    id: rfp.id,
    title: rfp.title,
    description: rfp.description,
    statement_of_work: rfp.statement_of_work,
    deliverables: rfp.deliverables,
    metadata: rfp.metadata,
    raw_data: rfp.raw_data,
  });
  await ensurePastProjectsEmbedded(admin, contractorId);

  const timing = scoreTiming({
    dueDate: rfp.due_date,
    preferredResponseWindowDays: contractor.preferred_response_window_days,
  });

  const geography = scoreGeography({
    preferredLocations: contractor.preferred_locations,
    rfpState: rfp.state,
    rfpLocation: rfp.location,
  });

  const keywords = scoreKeywords({
    rfpTitle: rfp.title,
    rfpDescription: rfp.description,
    rfpTags: rfp.tags,
    pastProjectTags: (pastProjects ?? []).flatMap((p) => p.tags),
    contractorIndustries: contractor.industries,
    contractorSubIndustries: contractor.sub_industries,
  });

  const [experience, goals, prereqs, agency] = await Promise.all([
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
    scoreAgency(admin, {
      rfpDepartment: rfp.department,
      pastClients: (pastProjects ?? []).map((p) => p.client),
    }),
  ]);

  const nullFactors: ScoreFactorName[] = [];
  if (timing.isNull) nullFactors.push("timing");
  if (experience.isNull) nullFactors.push("experience");
  if (goals.isNull) nullFactors.push("goals");
  if (prereqs.isNull) nullFactors.push("prereqs");
  if (geography.isNull) nullFactors.push("geography");
  if (agency.isNull) nullFactors.push("agency");
  if (keywords.isNull) nullFactors.push("keywords");

  const weights = renormalizeWeights(nullFactors);

  // Normalize each factor's score onto 0–1 for the weighted sum.
  const normalized: Record<ScoreFactorName, number> = {
    timing: timing.factor.score, // already 0 or 1
    experience: experience.factor.score / 100,
    goals: goals.factor.score / 100,
    prereqs: prereqs.factor.score / 100,
    geography: geography.factor.score / 100,
    agency: agency.factor.score / 100,
    keywords: keywords.factor.score / 100,
  };

  let total = weightedTotal(normalized, weights);
  if (exclusion.excluded) total = 0;

  const factors: CompatibilityFactors = {
    timing: timing.factor,
    experience: experience.factor,
    goals: goals.factor,
    prereqs: prereqs.factor,
    geography: geography.factor,
    agency: agency.factor,
    keywords: keywords.factor,
  };

  const reasoning = exclusion.excluded
    ? exclusion.reason
    : await generateReasoning({
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
    ...(exclusion.excluded
      ? { excluded: { term: exclusion.term, reason: exclusion.reason } }
      : {}),
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
