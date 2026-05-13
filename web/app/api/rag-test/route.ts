import { createGroq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { embed, generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_QUERY = 8_000;
const MAX_MOCK_CHUNKS = 30;
const MAX_CHUNK_CHARS = 20_000;

const requestSchema = z.object({
  query: z.string().min(1).max(MAX_QUERY),
  filterRfpIds: z.array(z.string().uuid()).max(100).optional(),
  mockChunks: z.array(z.string().max(MAX_CHUNK_CHARS)).max(MAX_MOCK_CHUNKS).optional(),
  matchThreshold: z.number().min(0).max(1).optional(),
  matchCount: z.number().min(1).max(50).optional(),
});

type ChunkRow = {
  id: string;
  rfp_id: string;
  chunk_text: string;
  similarity: number;
};

function formatContext(chunks: ChunkRow[]): string {
  if (chunks.length === 0) {
    return "(No retrieved chunks matched the threshold.)";
  }
  return chunks
    .map(
      (c, i) =>
        `### Chunk ${i + 1} (rfp_id=${c.rfp_id}, similarity=${c.similarity.toFixed(4)})\n${c.chunk_text}`,
    )
    .join("\n\n");
}

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "RAG test is not configured (missing GROQ_API_KEY)." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { query, filterRfpIds, mockChunks } = parsed.data;
  const matchThreshold = parsed.data.matchThreshold ?? 0.35;
  const matchCount = Math.floor(parsed.data.matchCount ?? 10);

  const warnings: string[] = [];
  let chunks: ChunkRow[] = [];

  if (mockChunks && mockChunks.length > 0) {
    chunks = mockChunks.map((chunk_text, i) => ({
      id: `mock-${i}`,
      rfp_id: "mock",
      chunk_text,
      similarity: 1,
    }));
    warnings.push("Using mockChunks; Supabase vector search was skipped.");
  } else {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Vector retrieval requires OPENAI_API_KEY for query embeddings (text-embedding-3-small, 1536 dims), or pass mockChunks to skip retrieval.",
        },
        { status: 503 },
      );
    }

    let queryEmbedding: number[];
    try {
      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: query,
      });
      queryEmbedding = embedding;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Embedding request failed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const { data, error } = await supabase.rpc("match_rfp_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_rfp_ids:
        filterRfpIds && filterRfpIds.length > 0 ? filterRfpIds : null,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code, warnings },
        { status: 502 },
      );
    }

    chunks = (data ?? []) as ChunkRow[];
    if (chunks.length === 0) {
      warnings.push(
        "No chunks above the similarity threshold; try lowering matchThreshold (e.g. 0.2) for the rag-dev-fixture seed.",
      );
    }
  }

  const context = formatContext(chunks);

  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

  try {
    const { text } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      system:
        "You answer using ONLY the context chunks provided. " +
        "If the context is empty or insufficient, say what is missing in one short paragraph. " +
        "Do not invent solicitation numbers, agencies, or requirements not present in the context.",
      prompt:
        `User question:\n${query}\n\nContext:\n${context}\n\nAnswer concisely.`,
    });

    return NextResponse.json({
      answer: text.trim(),
      chunksUsed: chunks.map((c) => ({
        id: c.id,
        rfp_id: c.rfp_id,
        similarity: c.similarity,
        preview: c.chunk_text.slice(0, 400) + (c.chunk_text.length > 400 ? "…" : ""),
      })),
      warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Model request failed.";
    return NextResponse.json({ error: message, warnings }, { status: 502 });
  }
}
