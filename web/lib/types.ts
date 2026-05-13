export type Rfp = {
  id: string;
  title: string;
  agency: string;
  dueDate: string;
  score: number;
  tags: string[];
  location: string;
  contract: string;
  description: string;
  /** Deliverable bullets extracted from the RFP package (`rfps.deliverables`). */
  deliverables: string[];
  /** Non-empty `rfps.pdf_url_1` … `pdf_url_10` in column order */
  pdfUrls: string[];
  /** Statement of work + deliverables rendered as markdown for the SOW tab. */
  sowMarkdown: string;
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
