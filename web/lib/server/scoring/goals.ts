import { openai } from "@ai-sdk/openai";
import { embed, generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import type { CompatibilityFactors } from "@/lib/types";
import { buildGoalsPrompt, SCORING_PROMPTS } from "./prompts";

type AdminClient = SupabaseClient<Database>;

const MATCH_THRESHOLD = 0.2;
const TOP_RFP_CHUNKS = 6;

const judgeSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string().min(1).max(600),
});

export type GoalsInputs = {
  rfpId: string;
  rfpTitle: string;
  rfpDescription: string | null;
  goals: string | null;
};

export type GoalsResult = {
  factor: CompatibilityFactors["goals"];
  isNull: boolean;
};

/**
 * Cat 3 — Goals match.
 * Embeds the contractor's free-text goals, retrieves the most relevant RFP
 * chunks, and asks an LLM to score the match 0–100.
 *
 * Returns isNull=true when the contractor has no goals text on file.
 */
export async function scoreGoals(
  admin: AdminClient,
  { rfpId, rfpTitle, rfpDescription, goals }: GoalsInputs,
): Promise<GoalsResult> {
  const goalsText = (goals ?? "").trim();
  if (!goalsText) {
    return {
      isNull: true,
      factor: {
        score: 0,
        reason: "Skipped: contractor has not provided goals text.",
      },
    };
  }

  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: goalsText.slice(0, 12_000),
  });

  const { data: chunkHits } = await admin.rpc("match_rfp_chunks", {
    query_embedding: embedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: TOP_RFP_CHUNKS,
    filter_rfp_ids: [rfpId],
  });

  const rfpChunks = (chunkHits ?? []).map((c) => c.chunk_text);
  const chunksForJudge =
    rfpChunks.length > 0
      ? rfpChunks
      : [(rfpDescription ?? rfpTitle).slice(0, 4000)];

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: judgeSchema,
    schemaName: "GoalsJudgement",
    system: SCORING_PROMPTS.goalsSystem,
    prompt: buildGoalsPrompt({
      rfpTitle,
      rfpChunks: chunksForJudge,
      goals: goalsText,
    }),
  });

  return {
    isNull: false,
    factor: {
      score: Math.round(object.score),
      reason: object.reason,
    },
  };
}
