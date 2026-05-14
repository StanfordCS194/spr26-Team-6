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
