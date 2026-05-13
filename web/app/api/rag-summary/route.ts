import { createGroq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { embed, generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  contractorRowToProfile,
  mapRfpRow,
} from "@/lib/mappers";
import {
  ensurePastProjectsEmbedded,
  ensureRfpChunksEmbedded,
} from "@/lib/server/ragPipeline";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const RAG_SUMMARY_TYPE = "rag_contractor" as const;
const PROMPT_VERSION = "v1";

const requestSchema = z.object({
  rfp_id: z.string().uuid(),
  contractor_id: z.string().uuid(),
});

type RfpChunkHit = {
  id: string;
  rfp_id: string;
  chunk_text: string;
  similarity: number;
};

type PastHit = {
  id: string;
  contractor_id: string;
  project_name: string;
  description: string | null;
  similarity: number;
};

function buildCitationContext(
  rfpChunks: RfpChunkHit[],
  past: PastHit[],
): { block: string; citations: CitationOut[] } {
  const citations: CitationOut[] = [];
  const parts: string[] = [];

  rfpChunks.forEach((c, i) => {
    const ref = `R${i + 1}`;
    citations.push({
      ref,
      kind: "rfp_chunk",
      label: `RFP chunk ${i + 1}`,
      excerpt: c.chunk_text.slice(0, 320) + (c.chunk_text.length > 320 ? "…" : ""),
      similarity: c.similarity,
    });
    parts.push(`### ${ref}\n(similarity ${c.similarity.toFixed(3)})\n${c.chunk_text}`);
  });

  past.forEach((p, i) => {
    const ref = `P${i + 1}`;
    const body = [p.project_name, p.description ?? ""].filter(Boolean).join("\n");
    citations.push({
      ref,
      kind: "past_project",
      label: p.project_name || "Past performance",
      excerpt: body.slice(0, 320) + (body.length > 320 ? "…" : ""),
      similarity: p.similarity,
    });
    parts.push(`### ${ref}: ${p.project_name || "Past project"}\n(similarity ${p.similarity.toFixed(3)})\n${body}`);
  });

  return {
    block: parts.join("\n\n---\n\n"),
    citations,
  };
}

type CitationOut = {
  ref: string;
  kind: "rfp_chunk" | "past_project";
  label: string;
  excerpt: string;
  similarity: number;
};

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Summaries require OPENAI_API_KEY (embeddings)." },
      { status: 503 },
    );
  }
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "Summaries require GROQ_API_KEY (generation)." },
      { status: 503 },
    );
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfiguration.";
    return NextResponse.json(
      {
        error:
          `${msg} Chunk writes and summary cache use the service role key server-side.`,
      },
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

  const { rfp_id, contractor_id } = parsed.data;

  const { data: contractor, error: conErr } = await supabase
    .from("contractors")
    .select("*")
    .eq("id", contractor_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (conErr || !contractor) {
    return NextResponse.json(
      { error: "Contractor not found for this account." },
      { status: 403 },
    );
  }

  const { data: pastRows } = await supabase
    .from("contractor_past_projects")
    .select("*")
    .eq("contractor_id", contractor_id);

  const profile = contractorRowToProfile(contractor, pastRows ?? []);

  const { data: scoreRows } = await supabase
    .from("scores")
    .select("*")
    .eq("contractor_id", contractor_id);

  const { data: rfpRow, error: rfpErr } = await supabase
    .from("rfps")
    .select("*")
    .eq("id", rfp_id)
    .maybeSingle();

  if (rfpErr || !rfpRow) {
    return NextResponse.json({ error: "RFP not found." }, { status: 404 });
  }

  const warnings: string[] = [];

  try {
    await ensureRfpChunksEmbedded(admin, {
      id: rfpRow.id,
      title: rfpRow.title,
      description: rfpRow.description,
    });
    const { updated } = await ensurePastProjectsEmbedded(admin, contractor_id);
    if (updated > 0) {
      warnings.push(`Embedded ${updated} past performance row(s) for retrieval.`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Indexing failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const profileBlob = [
    profile.industries,
    profile.subIndustries,
    profile.goals,
    profile.pastExperience,
  ]
    .join("\n\n")
    .trim()
    .slice(0, 12_000);

  let profileEmbedding: number[];
  try {
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: profileBlob || "Contractor profile (minimal).",
    });
    profileEmbedding = embedding;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Embedding failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const matchThreshold = 0.22;
  const matchCount = 14;

  const { data: chunkData, error: chunkRpcErr } = await supabase.rpc(
    "match_rfp_chunks",
    {
      query_embedding: profileEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_rfp_ids: [rfp_id],
    },
  );

  if (chunkRpcErr) {
    return NextResponse.json(
      { error: chunkRpcErr.message, code: chunkRpcErr.code },
      { status: 502 },
    );
  }

  let rfpChunks = (chunkData ?? []) as RfpChunkHit[];

  const rfpQueryText = [rfpRow.title, rfpRow.description ?? ""]
    .filter(Boolean)
    .join("\n\n")
    .trim()
    .slice(0, 12_000);

  let rfpEmbed: number[];
  try {
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: rfpQueryText || rfpRow.title || "RFP",
    });
    rfpEmbed = embedding;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Embedding failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { data: pastData, error: pastRpcErr } = await supabase.rpc(
    "match_past_projects",
    {
      query_embedding: rfpEmbed,
      match_threshold: matchThreshold,
      match_count: 6,
      filter_contractor_id: contractor_id,
    },
  );

  if (pastRpcErr) {
    return NextResponse.json(
      { error: pastRpcErr.message, code: pastRpcErr.code },
      { status: 502 },
    );
  }

  let pastHits = (pastData ?? []) as PastHit[];

  if (rfpChunks.length === 0) {
    warnings.push(
      "Vector retrieval returned no RFP chunks above the threshold; using full description as fallback context.",
    );
    const desc = rfpRow.description?.trim() || "";
    rfpChunks = [
      {
        id: "fallback",
        rfp_id: rfp_id,
        chunk_text: desc || "(No RFP description in the database.)",
        similarity: 0,
      },
    ];
  }

  if (pastHits.length === 0 && profile.pastExperience.trim()) {
    warnings.push(
      "No embedded past projects matched; quoting saved profile narrative instead.",
    );
    pastHits = [
      {
        id: "profile-fallback",
        contractor_id,
        project_name: "Profile narrative",
        description: profile.pastExperience.trim(),
        similarity: 0,
      },
    ];
  }

  const { block: contextBlock, citations } = buildCitationContext(
    rfpChunks,
    pastHits,
  );

  const stubRfp = mapRfpRow(
    rfpRow,
    contractor_id,
    scoreRows ?? undefined,
    undefined,
  );
  const scoreLine = `Heuristic match score (cached): **${stubRfp.score}/100**.`;

  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

  let markdown: string;
  try {
    const { text } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      system:
        "You are a government contracting analyst. Write concise markdown for a bidder. " +
        "Use ONLY the provided context blocks (R1… = RFP excerpts, P1… = contractor past performance). " +
        "When you state a requirement or claim fit, cite the source like [R2] or [P1]. " +
        "If context is thin, say so honestly. Do not invent solicitation numbers or agencies not in the text.",
      prompt:
        `## Contractor snapshot\n${profileBlob || "(Profile mostly empty.)"}\n\n` +
        `${scoreLine}\n\n` +
        `## Retrieved evidence (cite with [R#] / [P#])\n\n${contextBlock}\n\n` +
        `---\n\nProduce markdown with these sections:\n` +
        `### Fit summary\n` +
        `### Gaps and risks\n` +
        `### Suggested diligence\n`,
    });
    markdown = text.trim();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Model request failed.";
    return NextResponse.json({ error: message, warnings }, { status: 502 });
  }

  const modelName = "llama-3.3-70b-versatile";

  const { error: cacheErr } = await admin.from("rfp_summaries").upsert(
    {
      rfp_id,
      summary: markdown,
      summary_type: RAG_SUMMARY_TYPE,
      prompt_version: `${contractor_id}:${PROMPT_VERSION}`,
      model: modelName,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "rfp_id,summary_type,prompt_version" },
  );

  if (cacheErr) {
    warnings.push(`Could not cache summary: ${cacheErr.message}`);
  }

  return NextResponse.json({
    markdown,
    citations,
    warnings,
  });
}
