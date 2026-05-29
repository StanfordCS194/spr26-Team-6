import type { Database, Json } from "@/lib/database.types";
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

/** Normalize NAICS/UNSPSC codes from rfps.metadata for client-side filtering. */
export function extractProcurementCodes(metadata: Json): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const m = metadata as Record<string, Json | undefined>;
  const out: string[] = [];

  if (Array.isArray(m.naics_codes)) {
    for (const item of m.naics_codes) {
      if (typeof item === "string") {
        const digits = item.replace(/\D/g, "");
        if (digits) out.push(digits);
      }
    }
  }

  if (Array.isArray(m.unspsc_codes)) {
    for (const item of m.unspsc_codes) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const code = (item as { code?: unknown }).code;
        if (typeof code === "string") {
          const digits = code.replace(/\D/g, "");
          if (digits) out.push(digits);
        }
      }
    }
  }

  return [...new Set(out)];
}

/** True when any RFP code matches the user-entered prefix (NAICS or UNSPSC). */
export function procurementCodeMatchesPrefix(
  codes: string[],
  prefix: string,
): boolean {
  const p = prefix.replace(/\D/g, "");
  if (!p) return true;
  return codes.some((code) => code.startsWith(p) || p.startsWith(code));
}

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
  const deliverables = row.deliverables?.length ? [...row.deliverables] : [];
  return {
    id: row.id,
    source: row.source,
    procurementCodes: extractProcurementCodes(row.metadata),
    // Prefer the curated short name from rfps.name; fall back to title when
    // a row predates the name-extraction pipeline.
    name: (row.name ?? "").trim() || row.title,
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
    statementOfWork: (row.statement_of_work ?? "").trim(),
    deliverables,
    pdfUrls: collectPdfUrlsFromRfpRow(row),
    aiAnalysisMarkdown:
      aiOverride ?? buildAiAnalysisMarkdown(score ?? 0, location),
    summaryMarkdown: null,
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
  // Past-experience textbox is stored as the row(s) with no `client` set.
  // Past-client agency tags are stored as rows where `client` is non-empty;
  // those are surfaced as a separate comma-separated field for the agency
  // factor of the compatibility score.
  const pastExperience = pastProjects
    .filter((p) => !(p.client ?? "").trim())
    .map((p) => {
      const head =
        p.project_name && p.project_name !== "Experience profile"
          ? `**${p.project_name}**\n`
          : "";
      const body = p.description ?? "";
      return `${head}${body}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");

  const seenClients = new Set<string>();
  const pastClientsList: string[] = [];
  for (const p of pastProjects) {
    const c = (p.client ?? "").trim();
    if (!c) continue;
    const key = c.toLowerCase();
    if (seenClients.has(key)) continue;
    seenClients.add(key);
    pastClientsList.push(c);
  }

  const asArr = <T,>(value: T[] | null | undefined): T[] =>
    Array.isArray(value) ? value : [];

  return {
    industries: asArr(row.industries).join(", "),
    subIndustries: asArr(row.sub_industries).join(", "),
    goals: row.goals ?? "",
    pastExperience,
    pastClients: pastClientsList.join(", "),
    preferredLocations: asArr(row.preferred_locations).join(", "),
    preferredContractMin:
      row.preferred_contract_min != null
        ? String(row.preferred_contract_min)
        : "",
    preferredContractMax:
      row.preferred_contract_max != null
        ? String(row.preferred_contract_max)
        : "",
    preferredResponseWindowDays:
      row.preferred_response_window_days != null
        ? String(row.preferred_response_window_days)
        : "",
    certifications: asArr(row.certifications),
    setAsideEligibility: asArr(row.set_aside_eligibility),
    naicsCodes: asArr(row.naics_codes).join(", "),
    exclusions: asArr(row.exclusions).join(", "),
  };
}

function parseOptionalNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInt(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function profileToContractorUpdate(
  p: ContractorProfile,
): Database["public"]["Tables"]["contractors"]["Update"] {
  return {
    industries: splitList(p.industries),
    sub_industries: splitList(p.subIndustries),
    goals: p.goals || null,
    preferred_locations: splitList(p.preferredLocations),
    preferred_contract_min: parseOptionalNumber(p.preferredContractMin),
    preferred_contract_max: parseOptionalNumber(p.preferredContractMax),
    preferred_response_window_days: parseOptionalInt(
      p.preferredResponseWindowDays,
    ),
    certifications: [...p.certifications],
    set_aside_eligibility: [...p.setAsideEligibility],
    naics_codes: splitList(p.naicsCodes),
    exclusions: splitList(p.exclusions),
    updated_at: new Date().toISOString(),
  };
}
