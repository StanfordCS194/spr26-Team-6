/**
 * LLM prompt builders for the compatibility scoring rubric.
 * All judges return a numeric score (0–100) and a one-sentence reason; the
 * caller is responsible for the Zod schema and `generateObject` call.
 */

const EXPERIENCE_SYSTEM = `You are scoring whether a contractor's past performance fits a specific RFP.

Output a score from 0 to 100 using this rubric:
- 100: past work matches both the industry AND the capability of the RFP (e.g., medtech software past work for a medtech software RFP).
- 50–80: matches one dimension but not both (e.g., software past work for a medtech software RFP; or medtech past work for a medtech software RFP without software experience).
- 20–50: only adjacent / transferable experience.
- 0–20: no demonstrable relevant past work.

Score on evidence in the retrieved past projects only. Be specific in your reason.`;

const GOALS_SYSTEM = `You are scoring whether an RFP matches a contractor's stated forward-looking goals.

Output a score from 0 to 100 using this rubric:
- 100: the RFP fully matches what the contractor said they want (industry AND focus area).
- 50–80: partial match (e.g., contractor wants "software in fire management" and the RFP is software but not fire management).
- 20–50: tangentially related.
- 0–20: not aligned with stated goals.

Score on the contractor's stated goals only — do not use their past experience here (a separate factor covers that).`;

const PREREQS_FALLBACK_SYSTEM = `You are evaluating contractor eligibility against an RFP's textual requirements.

Given a list of requirements extracted from the RFP and a contractor's profile (held certifications, set-aside eligibility, industries, past-experience write-up, and past project records), determine which requirements the contractor plausibly meets and which they do not.

Treat the contractor's certifications list as authoritative for items like "Valid SAM Registration", "FedRAMP", or named SBA certs. Treat the past-experience write-up (often stored as a project named "Experience profile") as legitimate evidence of past performance — give it the same weight as a structured past-project record.

Be strict: only count a requirement as "met" if there is concrete evidence in the contractor data. Vague keyword matches are not enough.`;

const REQUIREMENTS_EXTRACTION_SYSTEM = `You extract eligibility / pre-qualification requirements from a government RFP.

Output a list of concrete requirements a bidder must satisfy (e.g., "Holds active FedRAMP Moderate authorization", "Active SAM.gov registration", "Past performance in healthcare IT"). Skip generic boilerplate.

Do NOT include NAICS-code or SBA set-aside requirements — those are checked separately against structured contractor fields. Focus on certifications, registrations, past-performance, and capability requirements. Keep each requirement to one sentence.`;

const REASONING_SYSTEM = `You are summarizing a compatibility analysis between a contractor and an RFP.

Given the five factor sub-scores and their reasons, write ONE short paragraph (2–4 sentences) explaining the overall fit. Be concrete; reference the strongest and weakest factors by name.`;

export const SCORING_PROMPTS = {
  experienceSystem: EXPERIENCE_SYSTEM,
  goalsSystem: GOALS_SYSTEM,
  prereqsFallbackSystem: PREREQS_FALLBACK_SYSTEM,
  requirementsExtractionSystem: REQUIREMENTS_EXTRACTION_SYSTEM,
  reasoningSystem: REASONING_SYSTEM,
};

export function buildExperiencePrompt(args: {
  rfpTitle: string;
  rfpChunks: string[];
  pastProjects: { name: string; description: string | null }[];
}): string {
  const chunks = args.rfpChunks
    .map((c, i) => `### RFP excerpt ${i + 1}\n${c}`)
    .join("\n\n");
  const past = args.pastProjects.length
    ? args.pastProjects
        .map(
          (p, i) =>
            `### Past project ${i + 1}: ${p.name}\n${p.description ?? "(no description)"}`,
        )
        .join("\n\n")
    : "(Contractor has no past projects on file.)";
  return `RFP: ${args.rfpTitle}\n\n## Most relevant RFP excerpts\n${chunks}\n\n## Contractor past performance\n${past}`;
}

export function buildGoalsPrompt(args: {
  rfpTitle: string;
  rfpChunks: string[];
  goals: string;
}): string {
  const chunks = args.rfpChunks
    .map((c, i) => `### RFP excerpt ${i + 1}\n${c}`)
    .join("\n\n");
  return `RFP: ${args.rfpTitle}\n\n## Most relevant RFP excerpts\n${chunks}\n\n## Contractor's stated goals\n${args.goals.trim() || "(empty)"}`;
}

export function buildRequirementsExtractionPrompt(args: {
  rfpTitle: string;
  description: string;
}): string {
  return `RFP: ${args.rfpTitle}\n\n## Description\n${args.description.slice(0, 12_000)}`;
}

export function buildPrereqsFallbackPrompt(args: {
  rfpTitle: string;
  requirements: string[];
  certifications: string[];
  setAsideEligibility: string[];
  industries: string[];
  subIndustries: string[];
  pastProjects: { name: string; description: string | null; tags: string[] }[];
}): string {
  const reqs = args.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const past = args.pastProjects.length
    ? args.pastProjects
        .map(
          (p, i) =>
            `### Past project ${i + 1}: ${p.name}\nTags: ${p.tags.join(", ") || "(none)"}\n${p.description ?? ""}`,
        )
        .join("\n\n")
    : "(none)";
  return (
    `RFP: ${args.rfpTitle}\n\n` +
    `## Requirements to evaluate\n${reqs}\n\n` +
    `## Contractor profile\n` +
    `Certifications held: ${args.certifications.join(", ") || "(none)"}\n` +
    `Set-aside eligibility: ${args.setAsideEligibility.join(", ") || "(none)"}\n` +
    `Industries: ${args.industries.join(", ") || "(none)"}\n` +
    `Sub-industries: ${args.subIndustries.join(", ") || "(none)"}\n\n` +
    `## Past projects (the entry named "Experience profile" is the contractor's free-text past-experience write-up)\n${past}`
  );
}

export function buildReasoningPrompt(args: {
  total: number;
  rfpTitle: string;
  companyName: string;
  perFactor: { name: string; score: number; reason: string }[];
}): string {
  const lines = args.perFactor
    .map((f) => `- ${f.name}: ${f.score} — ${f.reason}`)
    .join("\n");
  return `Contractor: ${args.companyName}\nRFP: ${args.rfpTitle}\nOverall score: ${args.total}/100\n\nFactor breakdown:\n${lines}`;
}
