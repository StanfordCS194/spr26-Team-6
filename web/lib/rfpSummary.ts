import { z } from "zod";

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

export const RfpSummarySchema = z.object({
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
});

export type RfpSummary = z.infer<typeof RfpSummarySchema>;

export const SummaryRequestSchema = z.object({
  rfpText: z
    .string()
    .min(1, "rfpText is required")
    .max(200_000, "rfpText exceeds 200,000 character limit"),
  rfpTitle: z.string().max(500).optional(),
});

export type SummaryRequest = z.infer<typeof SummaryRequestSchema>;

export function formatRfpSummaryMarkdown(summary: RfpSummary): string {
  const blocks: string[] = [];

  blocks.push("### Scope of Work");
  blocks.push(summary.scope_of_work || "_Not stated in the RFP._");
  if (summary.scope_of_work_citations.length > 0) {
    blocks.push(
      summary.scope_of_work_citations
        .map((c) => `> ${c.quote}`)
        .join("\n>\n"),
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

  return blocks.join("\n\n");
}
