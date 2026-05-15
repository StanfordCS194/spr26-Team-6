import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/lib/database.types";
import type { CompatibilityFactors } from "@/lib/types";
import {
  buildPrereqsFallbackPrompt,
  buildRequirementsExtractionPrompt,
  SCORING_PROMPTS,
} from "./prompts";

type AdminClient = SupabaseClient<Database>;
type ContractorRow = Database["public"]["Tables"]["contractors"]["Row"];
type RfpRow = Database["public"]["Tables"]["rfps"]["Row"];
type PastProjectRow =
  Database["public"]["Tables"]["contractor_past_projects"]["Row"];

const requirementsSchema = z.object({
  requirements: z
    .array(z.string().min(1).max(400))
    .min(0)
    .max(15),
});

const fallbackSchema = z.object({
  met: z.array(z.string().min(1).max(400)).max(15),
  unmet: z.array(z.string().min(1).max(400)).max(15),
  reason: z.string().min(1).max(600),
});

export type PrereqsInputs = {
  contractor: Pick<
    ContractorRow,
    "certifications" | "set_aside_eligibility" | "naics_codes" | "industries" | "sub_industries"
  >;
  rfp: Pick<RfpRow, "title" | "description" | "metadata">;
  pastProjects: Pick<PastProjectRow, "project_name" | "description" | "tags">[];
};

export type PrereqsResult = {
  factor: CompatibilityFactors["prereqs"];
  isNull: boolean;
};

type RfpMetadata = {
  set_aside?: string | null;
  set_aside_description?: string | null;
  naics_codes?: string[] | null;
};

function extractRfpMetadata(raw: Json): RfpMetadata {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const m = raw as Record<string, Json | undefined>;
    return {
      set_aside: typeof m.set_aside === "string" ? m.set_aside : null,
      set_aside_description:
        typeof m.set_aside_description === "string"
          ? m.set_aside_description
          : null,
      naics_codes: Array.isArray(m.naics_codes)
        ? (m.naics_codes.filter((x) => typeof x === "string") as string[])
        : null,
    };
  }
  return {};
}

/**
 * Cat 5 — Pre-reqs match.
 * Hybrid:
 *   1. Compare contractor's structured fields (certifications, set-aside
 *      eligibility, NAICS codes) against the RFP's structured set_aside +
 *      naics_codes. Each comparable field contributes one "structured
 *      requirement" to the tally.
 *   2. If there are no structured RFP requirements OR the contractor has
 *      filled in no structured fields, fall back to LLM extraction of
 *      requirements from the RFP description and check them against the
 *      contractor's profile + past-project tags.
 */
export async function scorePrereqs({
  contractor,
  rfp,
  pastProjects,
}: PrereqsInputs): Promise<PrereqsResult> {
  const meta = extractRfpMetadata(rfp.metadata);

  const met: string[] = [];
  const unmet: string[] = [];

  let structuredCount = 0;
  const reasons: string[] = [];

  // NAICS
  if (meta.naics_codes && meta.naics_codes.length > 0) {
    structuredCount++;
    const overlap = meta.naics_codes.filter((code) =>
      contractor.naics_codes.includes(code),
    );
    if (overlap.length > 0) {
      met.push(`NAICS code match: ${overlap.join(", ")}`);
      reasons.push(`Matches NAICS ${overlap.join(", ")}.`);
    } else {
      unmet.push(
        `NAICS codes required (${meta.naics_codes.join(", ")}); contractor registered for ${contractor.naics_codes.join(", ") || "none"}.`,
      );
      reasons.push("Missing required NAICS code.");
    }
  }

  // Set-aside eligibility
  if (meta.set_aside && meta.set_aside.trim()) {
    structuredCount++;
    const required = meta.set_aside.trim();
    const eligible = contractor.set_aside_eligibility.some(
      (e) => e.toLowerCase() === required.toLowerCase(),
    );
    if (eligible) {
      met.push(`Set-aside eligible: ${required}`);
      reasons.push(`Eligible for ${required} set-aside.`);
    } else {
      unmet.push(`Set-aside requires ${required}; contractor not certified.`);
      reasons.push(`Not certified for ${required} set-aside.`);
    }
  }

  // If we got at least one structured signal, return based on that
  if (structuredCount > 0) {
    const score = Math.round((met.length / structuredCount) * 100);
    return {
      isNull: false,
      factor: {
        score,
        reason: reasons.join(" "),
        met,
        unmet,
        total: structuredCount,
      },
    };
  }

  // Fallback: extract requirements from the RFP description via LLM
  const description = (rfp.description ?? "").trim();
  if (!description) {
    return {
      isNull: true,
      factor: {
        score: 0,
        reason:
          "Skipped: RFP has no structured eligibility metadata and no description for the fallback LLM extractor.",
        met: [],
        unmet: [],
        total: 0,
      },
    };
  }

  const { object: req } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: requirementsSchema,
    schemaName: "ExtractedRequirements",
    system: SCORING_PROMPTS.requirementsExtractionSystem,
    prompt: buildRequirementsExtractionPrompt({
      rfpTitle: rfp.title,
      description,
    }),
  });

  if (req.requirements.length === 0) {
    return {
      isNull: true,
      factor: {
        score: 0,
        reason:
          "Skipped: no concrete eligibility requirements extractable from the RFP text.",
        met: [],
        unmet: [],
        total: 0,
      },
    };
  }

  const { object: judged } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: fallbackSchema,
    schemaName: "PrereqsJudgement",
    system: SCORING_PROMPTS.prereqsFallbackSystem,
    prompt: buildPrereqsFallbackPrompt({
      rfpTitle: rfp.title,
      requirements: req.requirements,
      industries: contractor.industries,
      subIndustries: contractor.sub_industries,
      pastProjects: pastProjects.map((p) => ({
        name: p.project_name,
        description: p.description,
        tags: p.tags,
      })),
    }),
  });

  const total = req.requirements.length;
  const metCount = Math.min(judged.met.length, total);
  const score = Math.round((metCount / total) * 100);

  return {
    isNull: false,
    factor: {
      score,
      reason: judged.reason,
      met: judged.met,
      unmet: judged.unmet,
      total,
    },
  };
}
