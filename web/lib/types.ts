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
};

export const defaultContractorProfile: ContractorProfile = {
  industries: "",
  subIndustries: "",
  goals: "",
  pastExperience: "",
};

/**
 * Structured breakdown stored in `scores.factors` (JSONB).
 * Mirrors the 5-category compatibility rubric.
 */
export type ScoreFactorName =
  | "timing"
  | "experience"
  | "goals"
  | "award"
  | "prereqs";

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
};

export type CompatibilityScore = {
  total: number;
  weights: Record<ScoreFactorName, number>;
  factors: CompatibilityFactors;
  null_factors: ScoreFactorName[];
  model_version: string;
};
