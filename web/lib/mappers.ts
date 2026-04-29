import type { Database } from "@/lib/database.types";
import type { ContractorProfile, Rfp } from "@/lib/types";

type ContractorRow = Database["public"]["Tables"]["contractors"]["Row"];
type PastProjectRow = Database["public"]["Tables"]["contractor_past_projects"]["Row"];
type RfpRow = Database["public"]["Tables"]["rfps"]["Row"];
type ScoreRow = Database["public"]["Tables"]["scores"]["Row"];

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
] as const satisfies readonly (keyof RfpRow)[];

export function collectPdfUrlsFromRfpRow(row: RfpRow): string[] {
  const out: string[] = [];
  for (const key of PDF_URL_KEYS) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) {
      out.push(v.trim());
    }
  }
  return out;
}

function buildSowMarkdown(description: string): string {
  return `## Statement of work\n\n${description}\n\n### Deliverables\n\n- Kickoff and discovery within 30 days of award.\n- Monthly status reporting through the performance period.\n- Final acceptance testing and handoff documentation.\n\n### Period of performance\n\nWork is expected to complete within **12 months** of contract start.\n`;
}

function buildAiAnalysisMarkdown(score: number, location: string): string {
  const geoNote = location.includes("CA")
    ? "Verify CA small business and in-state preferences where applicable."
    : "Check local subcontracting and geographic set-asides.";
  return `### Compatibility summary\n\nYour profile aligns at **${score}/100** with this opportunity based on cached or heuristic scoring.\n\n### Gap analysis\n\n- **Security / compliance:** Confirm required certifications (e.g. FedRAMP, StateRAMP) against your past performance.\n- **Staffing:** Validate key personnel clauses vs. bench depth for similar programs.\n- **Geography:** ${geoNote}\n\n### Score breakdown\n\n| Factor | Weight | Notes |\n| --- | --- | --- |\n| Past performance match | 35% | From embeddings + RAG when pipeline is connected |\n| Technical keywords | 25% | From RFP tags vs. profile |\n| Geography | 20% | Location overlap |\n| Contract size fit | 20% | vs. preferred contract range |\n`;
}

export function formatContractAmount(
  min: number | null,
  max: number | null,
): string {
  if (min == null && max == null) return "—";
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
      : n >= 1_000
        ? `$${Math.round(n / 1_000)}K`
        : `$${Math.round(n).toLocaleString()}`;
  if (min != null && max != null && min !== max) {
    return `${fmt(min)} – ${fmt(max)}`;
  }
  const v = min ?? max ?? 0;
  return fmt(v);
}

export function pickLatestScoreForRfp(
  scores: ScoreRow[] | null | undefined,
  rfpId: string,
  contractorId: string,
): number | null {
  if (!scores?.length) return null;
  const mine = scores.filter(
    (s) => s.rfp_id === rfpId && s.contractor_id === contractorId,
  );
  if (!mine.length) return null;
  mine.sort(
    (a, b) =>
      new Date(b.computed_at).getTime() - new Date(a.computed_at).getTime(),
  );
  return Number(mine[0].score);
}

export function mapRfpRow(
  row: RfpRow,
  contractorId: string,
  scoresForContractor: ScoreRow[] | null | undefined,
  aiOverride?: string,
): Rfp {
  const description = row.description ?? "";
  const score = pickLatestScoreForRfp(
    scoresForContractor,
    row.id,
    contractorId,
  );
  const location = row.location ?? "—";
  return {
    id: row.id,
    title: row.title,
    agency: row.department ?? row.state ?? "—",
    dueDate: row.due_date ? row.due_date.slice(0, 10) : "—",
    score: score ?? 0,
    tags: row.tags?.length ? [...row.tags] : [],
    location,
    contract: formatContractAmount(
      row.contract_amount_min,
      row.contract_amount_max,
    ),
    description,
    pdfUrls: collectPdfUrlsFromRfpRow(row),
    sowMarkdown: buildSowMarkdown(description),
    aiAnalysisMarkdown:
      aiOverride ?? buildAiAnalysisMarkdown(score ?? 0, location),
  };
}

function splitList(s: string): string[] {
  return s
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function contractorRowToProfile(
  row: ContractorRow,
  pastProjects: PastProjectRow[],
): ContractorProfile {
  const pastExperience = pastProjects
    .map((p) => {
      const head = p.project_name ? `**${p.project_name}**\n` : "";
      const body = p.description ?? "";
      return `${head}${body}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");

  return {
    industries: row.industries.join(", "),
    subIndustries: row.sub_industries.join(", "),
    goals: row.goals ?? "",
    pastExperience,
  };
}

export function profileToContractorUpdate(
  p: ContractorProfile,
): Database["public"]["Tables"]["contractors"]["Update"] {
  return {
    industries: splitList(p.industries),
    sub_industries: splitList(p.subIndustries),
    goals: p.goals || null,
    updated_at: new Date().toISOString(),
  };
}
