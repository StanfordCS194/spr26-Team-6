import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  assertHttpsPublicUrl,
  fetchWebsitePlainText,
} from "@/lib/server/profileSuggestFetch";

export const runtime = "nodejs";

const MAX_PASTE = 50_000;

const requestSchema = z.object({
  sourceText: z.string().max(MAX_PASTE).optional(),
  /** Validated again in handler (https + host allowlist). */
  websiteUrl: z.string().max(2048).optional(),
});

const suggestedCapabilitySchema = z.object({
  industries: z
    .string()
    .describe(
      "Comma-separated industry labels inferred from the source (e.g. Information Technology, Cybersecurity).",
    ),
  subIndustries: z
    .string()
    .describe(
      "Comma-separated specialties (e.g. SOC, cloud security, software development).",
    ),
  goals: z
    .string()
    .describe(
      "Short paragraph: what kinds of contracts or outcomes the contractor wants.",
    ),
  pastExperience: z
    .string()
    .describe(
      "Narrative of relevant past performance, programs, and certifications; plain text, can be several paragraphs.",
    ),
});

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI suggestions are not configured (missing OPENAI_API_KEY)." },
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

  const sourceText = (parsed.data.sourceText ?? "").trim().slice(0, MAX_PASTE);
  const websiteUrlRaw = (parsed.data.websiteUrl ?? "").trim();

  const warnings: string[] = [];
  const parts: string[] = [];

  if (websiteUrlRaw) {
    try {
      const normalized = assertHttpsPublicUrl(websiteUrlRaw);
      const fetched = await fetchWebsitePlainText(normalized);
      if (fetched.ok) {
        parts.push("=== Content from company website (HTML converted to text) ===\n");
        parts.push(fetched.text);
      } else {
        warnings.push(fetched.error);
      }
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : "Invalid website URL.");
    }
  }

  if (sourceText) {
    parts.push("\n=== Pasted source from the user ===\n");
    parts.push(sourceText);
  }

  const combined = parts.join("\n").trim();
  if (!combined) {
    return NextResponse.json(
      {
        error:
          "Provide pasted text and/or a valid https website URL with readable content.",
        warnings,
      },
      { status: 400 },
    );
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: suggestedCapabilitySchema,
      schemaName: "ContractorCapabilities",
      schemaDescription:
        "Structured contractor marketing and past performance for government bid matching.",
      system:
        "You extract contractor profile fields for a GovTech RFP matching product. " +
        "Use only information supported by the user-provided sources. " +
        "If something is unknown, write a conservative best guess or leave that section brief rather than inventing specific contract numbers or agencies. " +
        "Write in clear professional English.",
      prompt:
        "From the following sources, produce the four fields. " +
        "Industries and sub-industries should be comma-separated lists suitable for a search UI. " +
        "Past experience should read as a cohesive narrative (not bullet labels only).\n\n" +
        combined,
    });

    return NextResponse.json({
      profile: {
        industries: object.industries.trim(),
        subIndustries: object.subIndustries.trim(),
        goals: object.goals.trim(),
        pastExperience: object.pastExperience.trim(),
      },
      warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Model request failed.";
    return NextResponse.json(
      { error: message, warnings },
      { status: 502 },
    );
  }
}
