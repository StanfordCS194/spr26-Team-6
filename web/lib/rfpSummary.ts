import { z } from "zod";

export const GENERAL_SUMMARY_TYPE = "general";
export const DETAILED_SUMMARY_PROMPT_VERSION = "detailed-v4";

const Citation = z.object({
  quote: z
    .string()
    .describe(
      "Verbatim text excerpt copied from the RFP that supports this item. Do not paraphrase."
    ),
});

const Deadline = z.object({
  label: z
    .string()
    .describe(
      "Short name of the deadline, e.g. 'Proposal Due', 'Q&A Period Ends', 'Site Visit'."
    ),
  date: z
    .string()
    .describe(
      "Date as it appears in the RFP (ISO 8601 if available, otherwise the original string). Use 'unknown' if not stated."
    ),
  citation: Citation,
});

const Criterion = z.object({
  name: z
    .string()
    .describe("Name of the evaluation criterion, e.g. 'Technical Approach'."),
  description: z
    .string()
    .describe("Brief description of what this criterion evaluates."),
  weight_pct: z
    .number()
    .nullable()
    .describe(
      "Percent weight as a number between 0 and 100, or null if not stated."
    ),
  citation: Citation,
});

const SummaryFact = z.object({
  label: z
    .string()
    .describe(
      "Short label for the fact, e.g. 'Notice type', 'NAICS', 'Submission format', 'Sole-source authority'.",
    ),
  detail: z
    .string()
    .describe("The factual detail exactly supported by the provided material."),
  citation: Citation,
});

export const RfpSummarySchema = z.object({
  opportunity_posture: z
    .string()
    .describe(
      "A 2-4 sentence explanation of what kind of opportunity this is and how a bidder should interpret it: competitive RFP, RFI/sources sought, sole-source notice, amendment, follow-on/recompete, market research, etc. If not stated, return 'unknown'.",
    ),
  opportunity_posture_citations: z
    .array(Citation)
    .describe(
      "One to three verbatim quotes that support the opportunity_posture. Empty array if unknown.",
    ),
  scope_of_work: z
    .string()
    .describe(
      "A 3-6 sentence synthesized summary of the scope of work, grounded only in the RFP text. If the scope is not stated, return 'unknown'."
    ),
  scope_of_work_citations: z
    .array(Citation)
    .describe(
      "One to three verbatim quotes from the RFP that support the scope_of_work summary. Empty array if the scope is unknown."
    ),
  critical_deadlines: z
    .array(Deadline)
    .describe(
      "All critical dates such as proposal due date, Q&A period, site visit, contract start. Empty array if none are stated."
    ),
  evaluation_criteria: z
    .array(Criterion)
    .describe(
      "All evaluation criteria the RFP states will be used to score proposals. Empty array if none are stated."
    ),
  contract_details: z
    .array(SummaryFact)
    .describe(
      "Important procurement facts such as solicitation number, notice type, contract type, period of performance, option periods, NAICS, PSC, set-aside, size standard, intended awardee/incumbent, sole-source authority, place of performance, agency office, and pricing basis. Empty array if none are stated.",
    ),
  technical_work_areas: z
    .array(SummaryFact)
    .describe(
      "Concrete technical tasks, systems, tools, platforms, support volumes, security requirements, clearances, migration/modernization work, maintenance responsibilities, sustainment duties, and deliverable work areas. Empty array if none are stated.",
    ),
  submission_guidance: z
    .array(SummaryFact)
    .describe(
      "Instructions for vendors: what to submit, format, page limits, recipient/contact, submission portal/email, due date, whether submissions only inform market research or competition decisions, and whether the government will pay for responses. Empty array if none are stated.",
    ),
  points_of_contact: z
    .array(SummaryFact)
    .describe(
      "Named buyer contacts, contracting officers, emails, and phone numbers. Empty array if none are stated.",
    ),
});

export type RfpSummary = z.infer<typeof RfpSummarySchema>;

export const SummaryRequestSchema = z
  .object({
    rfpId: z.string().uuid().optional(),
    rfpText: z
      .string()
      .min(1, "rfpText is required")
      .max(200_000, "rfpText exceeds 200,000 character limit")
      .optional(),
    rfpTitle: z.string().max(500).optional(),
  })
  .refine((value) => Boolean(value.rfpId || value.rfpText), {
    message: "Either rfpId or rfpText is required",
    path: ["rfpId"],
  });

export type SummaryRequest = z.infer<typeof SummaryRequestSchema>;

export function formatRfpSummaryMarkdown(summary: RfpSummary): string {
  const blocks: string[] = [];

  blocks.push("### Opportunity Posture");
  blocks.push(summary.opportunity_posture || "_Not stated in the RFP._");
  if (summary.opportunity_posture_citations.length > 0) {
    blocks.push(
      summary.opportunity_posture_citations
        .map((c) => `> ${c.quote}`)
        .join("\n>\n"),
    );
  }

  blocks.push("### Scope of Work");
  blocks.push(summary.scope_of_work || "_Not stated in the RFP._");
  if (summary.scope_of_work_citations.length > 0) {
    blocks.push(
      summary.scope_of_work_citations
        .map((c) => `> ${c.quote}`)
        .join("\n>\n"),
    );
  }

  blocks.push("### Technical Work Areas");
  if (summary.technical_work_areas.length === 0) {
    blocks.push("_No technical work areas stated in the RFP._");
  } else {
    blocks.push(
      summary.technical_work_areas
        .map((f) => `- **${f.label}** — ${f.detail}\n  > ${f.citation.quote}`)
        .join("\n"),
    );
  }

  blocks.push("### Contract Details");
  if (summary.contract_details.length === 0) {
    blocks.push("_No contract details stated in the RFP._");
  } else {
    blocks.push(
      summary.contract_details
        .map((f) => `- **${f.label}** — ${f.detail}\n  > ${f.citation.quote}`)
        .join("\n"),
    );
  }

  blocks.push("### Critical Deadlines");
  if (summary.critical_deadlines.length === 0) {
    blocks.push("_No deadlines stated in the RFP._");
  } else {
    blocks.push(
      summary.critical_deadlines
        .map(
          (d) => `- **${d.label}** — ${d.date}\n  > ${d.citation.quote}`,
        )
        .join("\n"),
    );
  }

  blocks.push("### Submission Guidance");
  if (summary.submission_guidance.length === 0) {
    blocks.push("_No submission instructions stated in the RFP._");
  } else {
    blocks.push(
      summary.submission_guidance
        .map((f) => `- **${f.label}** — ${f.detail}\n  > ${f.citation.quote}`)
        .join("\n"),
    );
  }

  blocks.push("### Evaluation Criteria");
  if (summary.evaluation_criteria.length === 0) {
    blocks.push("_No evaluation criteria stated in the RFP._");
  } else {
    blocks.push(
      summary.evaluation_criteria
        .map((c) => {
          const weight =
            typeof c.weight_pct === "number" ? ` (${c.weight_pct}%)` : "";
          return `- **${c.name}**${weight} — ${c.description}\n  > ${c.citation.quote}`;
        })
        .join("\n"),
    );
  }

  blocks.push("### Points of Contact");
  if (summary.points_of_contact.length === 0) {
    blocks.push("_No points of contact stated in the RFP._");
  } else {
    blocks.push(
      summary.points_of_contact
        .map((f) => `- **${f.label}** — ${f.detail}\n  > ${f.citation.quote}`)
        .join("\n"),
    );
  }

  return blocks.join("\n\n");
}
