import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { chunkText } from "@/lib/server/textChunk";

const EMBEDDING_MODEL = openai.embedding("text-embedding-3-small");

type AdminClient = SupabaseClient<Database>;
type JsonRecord = Record<string, unknown>;

type RfpChunkInput = {
  id: string;
  title: string | null;
  description: string | null;
  statement_of_work?: string | null;
  deliverables?: string[] | null;
  metadata?: unknown;
  raw_data?: unknown;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractedDocumentText(metadata: JsonRecord): string {
  const blocks: string[] = [];
  for (const value of asArray(metadata.extracted_document_texts)) {
    const entry = asRecord(value);
    const text = cleanString(entry.text);
    if (!text) continue;
    const label = cleanString(entry.label) || "Attached document";
    blocks.push(`${label}\n${text}`);
  }

  const singleText = cleanString(metadata.extracted_document_text);
  if (singleText && !blocks.some((block) => block.includes(singleText.slice(0, 100)))) {
    blocks.push(singleText);
  }

  return blocks.join("\n\n");
}

function buildRfpChunkBody(rfp: RfpChunkInput): string {
  const metadata = asRecord(rfp.metadata);
  const rawMetadata = asRecord(asRecord(rfp.raw_data).metadata);
  const combinedMetadata = { ...rawMetadata, ...metadata };
  const attachmentText = extractedDocumentText(combinedMetadata);

  return [
    rfp.title?.trim() ? `Title:\n${rfp.title.trim()}` : "",
    rfp.description?.trim() ? `Description:\n${rfp.description.trim()}` : "",
    rfp.statement_of_work?.trim()
      ? `Statement of Work:\n${rfp.statement_of_work.trim()}`
      : "",
    rfp.deliverables?.length
      ? `Deliverables:\n${rfp.deliverables.join("\n")}`
      : "",
    attachmentText ? `Extracted Attachment Text:\n${attachmentText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/**
 * If the RFP has no vector rows yet, chunk the richest RFP text available
 * (canonical fields plus ingested attachment text), embed, and insert into
 * `rfp_chunks` (requires service-role client).
 */
export async function ensureRfpChunksEmbedded(
  admin: AdminClient,
  rfp: RfpChunkInput,
): Promise<{ created: number }> {
  const { count, error: countErr } = await admin
    .from("rfp_chunks")
    .select("id", { count: "exact", head: true })
    .eq("rfp_id", rfp.id);

  if (countErr) {
    throw new Error(countErr.message);
  }
  if ((count ?? 0) > 0) {
    return { created: 0 };
  }

  const body = buildRfpChunkBody(rfp);

  const pieces = chunkText(body || "(No description provided for this RFP.)");
  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: pieces,
  });

  if (embeddings.length !== pieces.length) {
    throw new Error("Embedding count mismatch for RFP chunks.");
  }

  const rows = pieces.map((chunk_text, chunk_index) => ({
    rfp_id: rfp.id,
    chunk_index,
    chunk_text,
    embedding: embeddings[chunk_index] as unknown as number[],
    metadata: { source: "rfp_full_context" as const },
  }));

  const { error: insErr } = await admin.from("rfp_chunks").insert(rows);
  if (insErr) {
    throw new Error(insErr.message);
  }

  return { created: pieces.length };
}

/**
 * Embeds any past-project rows for this contractor that still have null
 * `embedding` (service-role client).
 */
export async function ensurePastProjectsEmbedded(
  admin: AdminClient,
  contractorId: string,
): Promise<{ updated: number }> {
  const { data: rows, error: selErr } = await admin
    .from("contractor_past_projects")
    .select("id, project_name, description")
    .eq("contractor_id", contractorId)
    .is("embedding", null);

  if (selErr) {
    throw new Error(selErr.message);
  }
  if (!rows?.length) {
    return { updated: 0 };
  }

  const texts = rows.map((r) => {
    const head = r.project_name?.trim() ? `${r.project_name.trim()}\n` : "";
    const desc = r.description?.trim() ?? "";
    const combined = `${head}${desc}`.trim();
    return combined || "(Empty past performance row.)";
  });

  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: texts,
  });

  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const { error: upErr } = await admin
      .from("contractor_past_projects")
      .update({
        embedding: embeddings[i] as unknown as number[],
        updated_at: new Date().toISOString(),
      })
      .eq("id", rows[i].id);
    if (upErr) {
      throw new Error(upErr.message);
    }
    updated++;
  }

  return { updated };
}
