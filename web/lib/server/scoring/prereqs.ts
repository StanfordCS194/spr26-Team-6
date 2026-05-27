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

/**
 * NAICS hierarchy comparison. Codes are 6-digit strings.
 *   exact 6-digit          → 1.0
 *   same 4-digit prefix    → 0.6   (industry-group / industry)
 *   same 2-digit prefix    → 0.3   (sector)
 *   otherwise              → 0
 */
function naicsMatch(
  required: string,
  held: string,
): {
  score: number;
  level: "exact" | "industry-group" | "sector" | "none";
} {
  const a = (required ?? "").replace(/\D/g, "");
  const b = (held ?? "").replace(/\D/g, "");
  if (!a || !b) return { score: 0, level: "none" };
  if (a === b) return { score: 1, level: "exact" };
  if (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) {
    return { score: 0.6, level: "industry-group" };
  }
  if (a.length >= 2 && b.length >= 2 && a.slice(0, 2) === b.slice(0, 2)) {
    return { score: 0.3, level: "sector" };
  }
  return { score: 0, level: "none" };
}

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

  // NAICS — hierarchy-aware matching. For each required RFP code we take the
  // best match against any contractor-registered code:
  //   full 6-digit equal → 1.0  (counts as met)
  //   first 4 digits equal → 0.6 (counts as met, "industry group match")
  //   first 2 digits equal → 0.3 (counts as partial, NOT met)
  //   no overlap → 0           (counts as unmet)
  // A required code counts as "met" when the best match is ≥ 0.6.
  if (meta.naics_codes && meta.naics_codes.length > 0) {
    structuredCount++;
    const matchDetails = meta.naics_codes.map((req) => {
      let bestScore = 0;
      let bestCode = "";
      let bestLevel: "exact" | "industry-group" | "sector" | "none" = "none";
      for (const have of contractor.naics_codes) {
        const r = naicsMatch(req, have);
        if (r.score > bestScore) {
          bestScore = r.score;
          bestCode = have;
          bestLevel = r.level;
        }
      }
      return { required: req, bestScore, bestCode, bestLevel };
    });

    const exact = matchDetails.filter((m) => m.bestLevel === "exact");
    const group = matchDetails.filter((m) => m.bestLevel === "industry-group");
    const sector = matchDetails.filter((m) => m.bestLevel === "sector");
    const none = matchDetails.filter((m) => m.bestLevel === "none");

    if (exact.length > 0) {
      met.push(
        `NAICS exact match: ${exact.map((m) => m.required).join(", ")}`,
      );
      reasons.push(
        `Matches NAICS ${exact.map((m) => m.required).join(", ")}.`,
      );
    }
    if (group.length > 0) {
      met.push(
        `NAICS industry-group match: ${group
          .map((m) => `${m.required}~${m.bestCode}`)
          .join(", ")}`,
      );
      reasons.push(
        `Adjacent NAICS match (4-digit) for ${group.map((m) => m.required).join(", ")}.`,
      );
    }
    if (sector.length > 0) {
      unmet.push(
        `NAICS sector-only match (2-digit): ${sector
          .map((m) => `${m.required}~${m.bestCode}`)
          .join(", ")}`,
      );
      reasons.push(
        `Only broad sector overlap on NAICS ${sector.map((m) => m.required).join(", ")}.`,
      );
    }
    if (none.length > 0) {
      unmet.push(
        `NAICS not held: ${none.map((m) => m.required).join(", ")}.`,
      );
      reasons.push(
        `Missing NAICS ${none.map((m) => m.required).join(", ")}.`,
      );
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

  // Always also extract textual requirements from the description and judge
  // them against the contractor's certifications + past experience. This
  // catches eligibility items the structured NAICS / set-aside check can't
  // see ("Active SAM.gov registration required", "5+ years of past
  // performance in healthcare IT", etc.). Structured matches are merged in
  // afterwards so the score reflects every requirement we evaluated.
  const description = (rfp.description ?? "").trim();
  let llmMet: string[] = [];
  let llmUnmet: string[] = [];
  let llmReason = "";
  let llmTotal = 0;

  if (description) {
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

    if (req.requirements.length > 0) {
      const { object: judged } = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: fallbackSchema,
        schemaName: "PrereqsJudgement",
        system: SCORING_PROMPTS.prereqsFallbackSystem,
        prompt: buildPrereqsFallbackPrompt({
          rfpTitle: rfp.title,
          requirements: req.requirements,
          certifications: contractor.certifications,
          setAsideEligibility: contractor.set_aside_eligibility,
          industries: contractor.industries,
          subIndustries: contractor.sub_industries,
          pastProjects: pastProjects.map((p) => ({
            name: p.project_name,
            description: p.description,
            tags: p.tags,
          })),
        }),
      });
      llmMet = judged.met;
      llmUnmet = judged.unmet;
      llmReason = judged.reason;
      llmTotal = req.requirements.length;
    }
  }

  const total = structuredCount + llmTotal;
  if (total === 0) {
    return {
      isNull: true,
      factor: {
        score: 0,
        reason:
          "Skipped: RFP has no structured eligibility metadata and no extractable textual requirements.",
        met: [],
        unmet: [],
        total: 0,
      },
    };
  }

  const mergedMet = [...met, ...llmMet];
  const mergedUnmet = [...unmet, ...llmUnmet];
  const mergedReason = [reasons.join(" "), llmReason]
    .map((r) => r.trim())
    .filter(Boolean)
    .join(" ");
  const metCount = Math.min(mergedMet.length, total);
  const score = Math.round((metCount / total) * 100);

  return {
    isNull: false,
    factor: {
      score,
      reason: mergedReason,
      met: mergedMet,
      unmet: mergedUnmet,
      total,
    },
  };
}
