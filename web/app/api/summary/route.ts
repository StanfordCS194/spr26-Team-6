import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { RfpSummarySchema, SummaryRequestSchema } from "@/lib/rfpSummary";

const SYSTEM_INSTRUCTIONS = [
  "You summarize US government RFPs (Requests for Proposal) for prospective contractors.",
  "Only use facts that are explicitly present in the provided RFP text.",
  "Do not speculate, infer, or pull information from outside the RFP text.",
  "If a field is not stated in the RFP, return 'unknown' for strings or an empty array for lists.",
  "Every deadline and evaluation criterion must include a verbatim citation quote copied from the RFP text.",
].join(" ");

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsedBody = SummaryRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return Response.json(
      {
        error: "Invalid request body.",
        details: parsedBody.error.flatten(),
      },
      { status: 400 }
    );
  }
  const { rfpText, rfpTitle } = parsedBody.data;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const client = new OpenAI({ apiKey });
  const model = "gpt-4.1-mini";

  const userContent = [
    rfpTitle ? `RFP Title: ${rfpTitle}` : null,
    "RFP Text:",
    '"""',
    rfpText,
    '"""',
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  try {
    const response = await client.responses.parse({
      model,
      input: [
        { role: "system", content: SYSTEM_INSTRUCTIONS },
        { role: "user", content: userContent },
      ],
      text: { format: zodTextFormat(RfpSummarySchema, "rfp_summary") },
    });

    if (!response.output_parsed) {
      return Response.json(
        {
          error: "Model returned no parsed output.",
          incomplete_details: response.incomplete_details ?? null,
          status: response.status ?? null,
        },
        { status: 502 }
      );
    }

    return Response.json(response.output_parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
