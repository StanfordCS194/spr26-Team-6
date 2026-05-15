import { openai } from "@ai-sdk/openai";
import { embed, generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import type { CompatibilityFactors } from "@/lib/types";
import { buildExperiencePrompt, SCORING_PROMPTS } from "./prompts";

type AdminClient = SupabaseClient<Database>;

const MATCH_THRESHOLD = 0.2;
const TOP_RFP_CHUNKS = 6;
const TOP_PAST_PROJECTS = 5;

const judgeSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string().min(1).max(600),
});

export type ExperienceInputs = {
  rfpId: string;
  contractorId: string;
  rfpTitle: string;
};

export type ExperienceResult = {
  factor: CompatibilityFactors["experience"];
  isNull: boolean;
};

/**
 * Cat 2 — Experience match.
 * 1. Embed the RFP title+desc and run `match_past_projects` to pull the
 *    contractor's most-similar past projects.
 * 2. Pull the contractor's past projects embeddings against `match_rfp_chunks`
 *    to get the RFP chunks most-similar to the contractor's experience.
 * 3. Hand both to an LLM judge that returns a 0–100 score + reason.
 *
 * If the contractor has zero past projects we short-circuit to a low score
 * with a clear reason — never throw.
 */
export async function scoreExperience(
  admin: AdminClient,
  { rfpId, contractorId, rfpTitle }: ExperienceInputs,
): Promise<ExperienceResult> {
  const { data: pastList } = await admin
    .from("contractor_past_projects")
    .select("id, project_name, description")
    .eq("contractor_id", contractorId);

  if (!pastList || pastList.length === 0) {
    return {
      isNull: false,
      factor: {
        score: 0,
        reason: "Contractor has no past projects on file.",
        matched_past_projects: [],
      },
    };
  }

  // Embed the RFP for past-project retrieval
  const { data: rfp } = await admin
    .from("rfps")
    .select("title, description")
    .eq("id", rfpId)
    .maybeSingle();

  const rfpText = [rfp?.title ?? rfpTitle, rfp?.description ?? ""]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12_000);

  const { embedding: rfpEmbedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: rfpText || rfpTitle,
  });

  const { data: pastHits } = await admin.rpc("match_past_projects", {
    query_embedding: rfpEmbedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: TOP_PAST_PROJECTS,
    filter_contractor_id: contractorId,
  });

  const matchedPast = (pastHits ?? []).length
    ? (pastHits ?? []).map((p) => ({
        name: p.project_name,
        description: p.description,
      }))
    : pastList.slice(0, TOP_PAST_PROJECTS).map((p) => ({
        name: p.project_name,
        description: p.description,
      }));

  // Retrieve RFP chunks most similar to a concatenation of the past projects,
  // so the LLM sees the bits of the RFP that touch each side of the rubric.
  const pastBlob = matchedPast
    .map((p) => `${p.name}\n${p.description ?? ""}`)
    .join("\n\n")
    .slice(0, 12_000);
  const { embedding: pastEmbedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: pastBlob || rfpText,
  });

  const { data: chunkHits } = await admin.rpc("match_rfp_chunks", {
    query_embedding: pastEmbedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: TOP_RFP_CHUNKS,
    filter_rfp_ids: [rfpId],
  });

  const rfpChunks = (chunkHits ?? []).map((c) => c.chunk_text);
  // Fallback to the raw RFP description if no chunks crossed the threshold
  const chunksForJudge =
    rfpChunks.length > 0
      ? rfpChunks
      : [(rfp?.description ?? rfpTitle).slice(0, 4000)];

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: judgeSchema,
    schemaName: "ExperienceJudgement",
    system: SCORING_PROMPTS.experienceSystem,
    prompt: buildExperiencePrompt({
      rfpTitle,
      rfpChunks: chunksForJudge,
      pastProjects: matchedPast,
    }),
  });

  return {
    isNull: false,
    factor: {
      score: Math.round(object.score),
      reason: object.reason,
      matched_past_projects: matchedPast.map((p) => p.name),
    },
  };
}
