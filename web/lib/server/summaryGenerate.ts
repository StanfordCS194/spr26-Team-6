import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";
import {
  DETAILED_SUMMARY_PROMPT_VERSION,
  GENERAL_SUMMARY_TYPE,
  RfpSummarySchema,
  type RfpSummary,
} from "@/lib/rfpSummary";

export const SUMMARY_MODEL = "gpt-4.1-mini";

export const SUMMARY_SYSTEM_INSTRUCTIONS = [
  "You summarize US government RFPs (Requests for Proposal) for prospective contractors.",
  "Only use facts that are explicitly present in the provided RFP database record, extracted attachment text, or indexed RFP chunks.",
  "Do not speculate, infer, or pull information from outside the provided material.",
  "If a field is not stated in the provided material, return 'unknown' for strings or an empty array for lists.",
  "Canonical database fields are source material too; if a canonical line says 'Due date: ...' or 'Contact email: ...', you may cite that exact line.",
  "Every deadline, evaluation criterion, contract detail, technical work area, submission instruction, contact, and opportunity-posture claim must include a verbatim citation quote copied from the provided material.",
  "Actively look for opportunity posture signals: RFI, sources sought, market research, presolicitation, notice of intent, sole source, intended awardee, incumbent, follow-on, recompete, set-aside, and competition caveats.",
  "Actively look for contract mechanics: solicitation number, notice type, NAICS, PSC, set-aside, contract type, pricing, period of performance, option periods, extension periods, place of performance, agency office, size standard, authority, and intended awardee.",
  "Actively look for technical work areas: named systems, platforms, software/toolsets, maintenance/sustainment tasks, modernization/migration tasks, security requirements, clearances, support volumes, SLAs, ticketing tools, audit logging, role-based security, patching, upgrades, and deliverables.",
  "Actively look for submission guidance: what vendors should submit, deadline, email/portal, page limits, format, whether submissions will only inform market research or a competition decision, and whether the government will pay for responses.",
].join(" ");

const MAX_CONTEXT_CHARS = 200_000;
const MAX_SECTION_CHARS = 80_000;
const PDF_URL_KEYS = [
  "pdf_url_1",
  "pdf_url_2",
  "pdf_url_3",
  "pdf_url_4",
  "pdf_url_5",
  "pdf_url_6",
  "pdf_url_7",
  "pdf_url_8",
  "pdf_url_9",
  "pdf_url_10",
] as const;

type AdminClient = SupabaseClient<Database>;
type RfpRow = Database["public"]["Tables"]["rfps"]["Row"];
type RfpChunkRow = Pick<
  Database["public"]["Tables"]["rfp_chunks"]["Row"],
  "chunk_index" | "chunk_text" | "metadata"
>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function displayValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => displayValue(item))
      .filter(Boolean)
      .join(", ");
  }
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return "";
  return JSON.stringify(record);
}

function line(label: string, value: unknown): string | null {
  const text = displayValue(value);
  return text ? `${label}: ${text}` : null;
}

function pushSection(parts: string[], title: string, body: string): void {
  const trimmed = body.trim();
  if (!trimmed) return;
  parts.push(`## ${title}\n${trimmed.slice(0, MAX_SECTION_CHARS)}`);
}

function compactJson(value: unknown): string {
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function withoutLargeTextFields(record: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      key === "documents" ||
      key === "extracted_document_text" ||
      key === "extracted_document_texts"
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function documentLines(metadata: Record<string, unknown>, row: RfpRow): string {
  const lines: string[] = [];
  const docs = asArray(metadata.documents);
  docs.forEach((value, index) => {
    const doc = asRecord(value);
    const fields = [
      line("label", doc.label),
      line("type", doc.type),
      line("description", doc.attachment_description),
      line("source_url", doc.source_url),
      line("drive_url", doc.url),
      line("size_bytes", doc.size_bytes),
    ].filter((item): item is string => Boolean(item));
    if (fields.length) {
      lines.push(`Document ${index + 1}: ${fields.join("; ")}`);
    }
  });

  PDF_URL_KEYS.forEach((key) => {
    const url = row[key];
    if (typeof url === "string" && url.trim()) {
      lines.push(`${key}: ${url.trim()}`);
    }
  });

  return Array.from(new Set(lines)).join("\n");
}

function extractedDocumentText(metadata: Record<string, unknown>): string {
  const blocks: string[] = [];
  for (const value of asArray(metadata.extracted_document_texts)) {
    const entry = asRecord(value);
    const text = cleanString(entry.text);
    if (!text) continue;
    const label = cleanString(entry.label) || "Attached document";
    const type = cleanString(entry.type);
    blocks.push(
      [`### ${label}${type ? ` (${type})` : ""}`, text].join("\n"),
    );
  }

  const singleText = cleanString(metadata.extracted_document_text);
  if (singleText && !blocks.some((block) => block.includes(singleText.slice(0, 100)))) {
    blocks.push(`### Extracted attachment text\n${singleText}`);
  }

  return blocks.join("\n\n---\n\n");
}

export function buildRfpContext(row: RfpRow, chunks: RfpChunkRow[]): string {
  const metadata = asRecord(row.metadata as Json | null);
  const rawData = asRecord(row.raw_data as Json | null);
  const rawMetadata = asRecord(rawData.metadata);
  const combinedMetadata = { ...rawMetadata, ...metadata };
  const parts: string[] = [];

  pushSection(
    parts,
    "Canonical RFP Fields",
    [
      line("Source", row.source),
      line("External ID", row.external_id),
      line("Title", row.title),
      line("Short name", row.name),
      line("Department / agency", row.department),
      line("Status", row.status),
      line("Posted date", row.posted_date),
      line("Due date", row.due_date),
      line("Location", row.location),
      line("State", row.state),
      line("Location level", row.location_level),
      line("Contract amount minimum", row.contract_amount_min),
      line("Contract amount maximum", row.contract_amount_max),
      line("Tags", row.tags),
      line("Contact name", row.contact_name),
      line("Contact email", row.contact_email),
      line("Contact phone", row.contact_phone),
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n"),
  );

  pushSection(parts, "Description", row.description ?? "");
  pushSection(parts, "Statement of Work", row.statement_of_work ?? "");
  pushSection(parts, "Deliverables", (row.deliverables ?? []).join("\n"));
  pushSection(parts, "Attached Documents", documentLines(combinedMetadata, row));
  pushSection(
    parts,
    "Source Metadata",
    compactJson(withoutLargeTextFields(combinedMetadata)),
  );
  pushSection(
    parts,
    "Extracted Attachment Text",
    extractedDocumentText(combinedMetadata),
  );

  if (chunks.length > 0) {
    pushSection(
      parts,
      "Indexed RFP Chunks",
      chunks
        .sort((a, b) => a.chunk_index - b.chunk_index)
        .map((chunk) => {
          const meta = compactJson(chunk.metadata);
          return [
            `### Chunk ${chunk.chunk_index}`,
            meta ? `Metadata: ${meta}` : "",
            chunk.chunk_text,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n---\n\n"),
    );
  }

  return parts.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
}

export async function loadRfpContext(
  admin: AdminClient,
  rfpId: string,
): Promise<{ title: string | null; context: string }> {
  const { data: row, error: rfpErr } = await admin
    .from("rfps")
    .select("*")
    .eq("id", rfpId)
    .maybeSingle();

  if (rfpErr || !row) {
    throw new Error(rfpErr?.message ?? "RFP not found.");
  }

  const { data: chunks, error: chunksErr } = await admin
    .from("rfp_chunks")
    .select("chunk_index, chunk_text, metadata")
    .eq("rfp_id", rfpId)
    .order("chunk_index", { ascending: true });

  if (chunksErr) {
    throw new Error(chunksErr.message);
  }

  return { title: row.title, context: buildRfpContext(row, chunks ?? []) };
}

export async function generateSummary(
  openaiApiKey: string,
  rfpTitle: string | null | undefined,
  rfpText: string,
): Promise<RfpSummary> {
  const client = new OpenAI({ apiKey: openaiApiKey });

  const userContent = [
    rfpTitle ? `RFP Title: ${rfpTitle}` : null,
    "Extract a bidder-facing structured summary. Include opportunity posture, contract details, technical work areas, submission guidance, critical deadlines, evaluation criteria, and points of contact when stated.",
    "RFP database record, extracted attachment text, and indexed RFP text:",
    '"""',
    rfpText,
    '"""',
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const response = await client.responses.parse({
    model: SUMMARY_MODEL,
    input: [
      { role: "system", content: SUMMARY_SYSTEM_INSTRUCTIONS },
      { role: "user", content: userContent },
    ],
    text: { format: zodTextFormat(RfpSummarySchema, "rfp_summary") },
  });

  if (!response.output_parsed) {
    throw new Error(
      `Model returned no parsed output (status: ${response.status ?? "unknown"}).`,
    );
  }

  return response.output_parsed;
}

/** Delete stale summary rows (old prompt versions) for this RFP. */
export async function deleteStaleSummaries(
  admin: AdminClient,
  rfpId: string,
): Promise<void> {
  await admin
    .from("rfp_summaries")
    .delete()
    .eq("rfp_id", rfpId)
    .eq("summary_type", GENERAL_SUMMARY_TYPE)
    .is("prompt_version", null);
  await admin
    .from("rfp_summaries")
    .delete()
    .eq("rfp_id", rfpId)
    .eq("summary_type", GENERAL_SUMMARY_TYPE)
    .neq("prompt_version", DETAILED_SUMMARY_PROMPT_VERSION);
}

export async function storeSummary(
  admin: AdminClient,
  rfpId: string,
  summary: RfpSummary,
): Promise<void> {
  const { error } = await admin.from("rfp_summaries").upsert(
    {
      rfp_id: rfpId,
      summary: JSON.stringify(summary),
      summary_type: GENERAL_SUMMARY_TYPE,
      model: SUMMARY_MODEL,
      prompt_version: DETAILED_SUMMARY_PROMPT_VERSION,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "rfp_id,summary_type,prompt_version" },
  );

  if (error) {
    throw new Error(`Summary generated but could not be saved: ${error.message}`);
  }
}

/**
 * Full pipeline for one RFP: build context from the DB row + chunks, run the
 * LLM, and upsert the result into `rfp_summaries`.
 */
export async function generateAndStoreSummary(
  admin: AdminClient,
  openaiApiKey: string,
  rfpId: string,
): Promise<RfpSummary> {
  await deleteStaleSummaries(admin, rfpId);
  const { title, context } = await loadRfpContext(admin, rfpId);
  if (!context.trim()) {
    throw new Error("No RFP text was available for summary generation.");
  }
  const summary = await generateSummary(openaiApiKey, title, context);
  await storeSummary(admin, rfpId, summary);
  return summary;
}
