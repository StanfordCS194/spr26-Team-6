import type { Database } from "@/lib/database.types";

type RfpRow = Database["public"]["Tables"]["rfps"]["Row"];

const PROMPT_VERSION = "structured-v1";
const SUMMARY_TYPE = "general";
const MODEL = "deterministic-route";

export const summaryCacheMetadata = {
  model: MODEL,
  promptVersion: PROMPT_VERSION,
  summaryType: SUMMARY_TYPE,
} as const;

function text(value: unknown, fallback = "Not specified"): string {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

function amount(row: RfpRow): string {
  const min = row.contract_amount_min;
  const max = row.contract_amount_max;
  if (min == null && max == null) return "Not specified";
  const format = (value: number) =>
    `$${Math.round(value).toLocaleString("en-US")}`;
  if (min != null && max != null && min !== max) {
    return `${format(min)} - ${format(max)}`;
  }
  return format(min ?? max ?? 0);
}

function documentCount(row: RfpRow): number {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return row.pdf_url_1 ? 1 : 0;
  }
  const docs = (metadata as { documents?: unknown }).documents;
  return Array.isArray(docs) ? docs.length : row.pdf_url_1 ? 1 : 0;
}

export function buildStructuredSummary(row: RfpRow): string {
  const deliverables = row.deliverables?.length
    ? row.deliverables
    : ["Review the source package and respond to the solicitation requirements."];
  const deliverableLines = deliverables
    .map((item) => `- ${item}`)
    .join("\n");
  const tags = row.tags?.length ? row.tags.join(", ") : "Not tagged";
  const description = text(row.description);

  return [
    `## ${text(row.title, "Untitled opportunity")}`,
    [
      "### Opportunity Snapshot",
      `- **Agency:** ${text(row.department)}`,
      `- **Source:** ${text(row.source)}`,
      `- **Due date:** ${text(row.due_date)}`,
      `- **Location:** ${text(row.location)}`,
      `- **Estimated value:** ${amount(row)}`,
      `- **Attached source documents:** ${documentCount(row)}`,
    ].join("\n"),
    `### Scope Summary\n${text(row.statement_of_work ?? row.description)}`,
    `### Expected Deliverables\n${deliverableLines}`,
    `### Keywords\n${tags}`,
    `### Source Context\n${description}`,
  ].join("\n\n");
}
