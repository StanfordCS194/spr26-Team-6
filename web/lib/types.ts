export type Rfp = {
  id: string;
  /** Short curated project name from `rfps.name` (e.g. "CalHEERS SDMO Project"). */
  name: string;
  /** Full formal RFP title from `rfps.title` (e.g. "CalHEERS SDMO RFP #73040873"). */
  title: string;
  agency: string;
  dueDate: string;
  score: number;
  tags: string[];
  location: string;
  contract: string;
  description: string;
  /** Statement of work text from `rfps.statement_of_work`. */
  statementOfWork: string;
  /** Deliverable bullets extracted from the RFP package (`rfps.deliverables`). */
  deliverables: string[];
  /** Non-empty `rfps.pdf_url_1` … `pdf_url_10` in column order */
  pdfUrls: string[];
  /** Placeholder gap analysis for the AI tab */
  aiAnalysisMarkdown: string;
};

export type ContractorProfile = {
  industries: string;
  subIndustries: string;
  goals: string;
  pastExperience: string;
  /** Comma-separated free text, e.g. "California, Federal". */
  preferredLocations: string;
  /** Free-text number; empty string means unspecified. */
  preferredContractMin: string;
  preferredContractMax: string;
  /** Free-text number of days of lead time the contractor needs before due date. */
  preferredResponseWindowDays: string;
  /** Multi-select; each entry is a curated SBA-style label. */
  certifications: string[];
  setAsideEligibility: string[];
  /** Comma-separated free text, 6-digit NAICS codes. */
  naicsCodes: string;
  /** Comma-separated terms that hard-zero a match when found in an RFP. */
  exclusions: string;
};

export const defaultContractorProfile: ContractorProfile = {
  industries: "",
  subIndustries: "",
  goals: "",
  pastExperience: "",
  preferredLocations: "",
  preferredContractMin: "",
  preferredContractMax: "",
  preferredResponseWindowDays: "",
  certifications: [],
  setAsideEligibility: [],
  naicsCodes: "",
  exclusions: "",
};

/**
 * Curated options for the certifications / set-aside-eligibility multi-selects.
 * Same list serves both: contractor's held certifications largely overlap with
 * the set-asides they're eligible to bid on.
 */
export const SBA_CERTIFICATION_OPTIONS: readonly string[] = [
  "Small Business",
  "8(a)",
  "HUBZone",
  "WOSB",
  "EDWOSB",
  "SDVOSB",
  "VOSB",
  "SDB",
];

/**
 * Structured breakdown stored in `scores.factors` (JSONB).
 * Mirrors the 5-category compatibility rubric.
 */
export type ScoreFactorName =
  | "timing"
  | "experience"
  | "goals"
  | "award"
  | "prereqs"
  | "geography"
  | "agency"
  | "keywords";

export type CompatibilityFactors = {
  timing: { score: 0 | 1; reason: string };
  experience: {
    score: number;
    reason: string;
    matched_past_projects: string[];
  };
  goals: { score: number; reason: string };
  award: { score: 0 | 0.5 | 1; reason: string };
  prereqs: {
    score: number;
    reason: string;
    met: string[];
    unmet: string[];
    total: number;
  };
  geography: { score: number; reason: string };
  agency: { score: number; reason: string; matched_clients: string[] };
  keywords: {
    score: number;
    reason: string;
    matched_terms: string[];
  };
};

export type CompatibilityScore = {
  total: number;
  weights: Record<ScoreFactorName, number>;
  factors: CompatibilityFactors;
  null_factors: ScoreFactorName[];
  /** When set, an exclusion term matched and the total was hard-zeroed. */
  excluded?: { term: string; reason: string };
  model_version: string;
};
