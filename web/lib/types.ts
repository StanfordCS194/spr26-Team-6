export type Rfp = {
  id: number;
  title: string;
  agency: string;
  dueDate: string;
  score: number;
  tags: string[];
  location: string;
  contract: string;
  description: string;
  /** Stub SOW as markdown until PDF extraction pipeline exists */
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
