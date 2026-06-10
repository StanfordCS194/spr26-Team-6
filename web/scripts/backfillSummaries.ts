/**
 * Backfill LLM summaries for all dashboard-visible RFPs so users hit the
 * cached path instantly instead of waiting on generation.
 *
 * Usage (from web/):
 *   pnpm backfill:summaries            # only RFPs missing a current summary
 *   pnpm backfill:summaries -- --force # regenerate all
 *   pnpm backfill:summaries -- --limit=10
 */
import path from "node:path";
import { WebSocket } from "ws";

const CONCURRENCY = 3;

// supabase-js requires a WebSocket implementation on Node < 22.
if (!globalThis.WebSocket) {
  (globalThis as Record<string, unknown>).WebSocket = WebSocket;
}

try {
  process.loadEnvFile(path.join(__dirname, "..", ".env"));
} catch {
  // .env may be absent in CI; rely on the ambient environment.
}

function parseArgs() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  return { force, limit };
}

async function main() {
  const { force, limit } = parseArgs();

  // Imported lazily so the WebSocket polyfill and env vars are in place
  // before supabase-js and the admin client module are evaluated.
  const { DETAILED_SUMMARY_PROMPT_VERSION, GENERAL_SUMMARY_TYPE } =
    await import("@/lib/rfpSummary");
  const { generateAndStoreSummary } = await import(
    "@/lib/server/summaryGenerate"
  );
  const { createServiceRoleClient } = await import("@/lib/supabase/admin");

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const admin = createServiceRoleClient();

  const { data: rfps, error: rfpErr } = await admin
    .from("rfps")
    .select("id, title")
    .eq("status", "active")
    .eq("is_relevant", true)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (rfpErr) throw new Error(`Failed to load RFPs: ${rfpErr.message}`);

  const allIds = (rfps ?? []).map((r) => r.id);
  console.log(`Found ${allIds.length} active, relevant RFPs.`);

  let targetIds = allIds;
  if (!force && allIds.length > 0) {
    const { data: existing, error: sumErr } = await admin
      .from("rfp_summaries")
      .select("rfp_id")
      .in("rfp_id", allIds)
      .eq("summary_type", GENERAL_SUMMARY_TYPE)
      .eq("prompt_version", DETAILED_SUMMARY_PROMPT_VERSION);
    if (sumErr) {
      throw new Error(`Failed to load existing summaries: ${sumErr.message}`);
    }
    const done = new Set((existing ?? []).map((row) => row.rfp_id));
    targetIds = allIds.filter((id) => !done.has(id));
    console.log(
      `${done.size} already have a current summary; ${targetIds.length} to generate.`,
    );
  }

  targetIds = targetIds.slice(0, limit);
  if (targetIds.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const titleById = new Map((rfps ?? []).map((r) => [r.id, r.title ?? r.id]));
  let completed = 0;
  let failed = 0;
  const queue = [...targetIds];

  async function worker() {
    for (let rfpId = queue.shift(); rfpId; rfpId = queue.shift()) {
      const label = titleById.get(rfpId) ?? rfpId;
      try {
        await generateAndStoreSummary(admin, openaiApiKey!, rfpId);
        completed += 1;
        console.log(
          `[${completed + failed}/${targetIds.length}] ok      ${label}`,
        );
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[${completed + failed}/${targetIds.length}] FAILED  ${label}: ${msg}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targetIds.length) }, worker),
  );

  console.log(`\nDone. ${completed} generated, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
