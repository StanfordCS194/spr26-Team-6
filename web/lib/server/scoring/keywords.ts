import type { CompatibilityFactors } from "@/lib/types";

export type KeywordsInputs = {
  rfpTitle: string;
  rfpDescription: string | null;
  rfpTags: string[];
  pastProjectTags: string[];
  contractorIndustries: string[];
  contractorSubIndustries: string[];
};

export type KeywordsResult = {
  factor: CompatibilityFactors["keywords"];
  isNull: boolean;
};

/**
 * Cat 8 — Specific tech / keyword overlap.
 *
 * Lexical signal (not embeddings). For each contractor-side term (past-project
 * tags, industries, sub-industries) check whether the term appears as a whole-
 * word match in the RFP tags, title, or description. The score is the fraction
 * of contractor terms matched, capped at 100, with the matched terms returned.
 *
 *   - Whole-word, case-insensitive
 *   - Stopwords / very short tokens are skipped on both sides
 *   - Null when the contractor has no terms at all
 */
export function scoreKeywords({
  rfpTitle,
  rfpDescription,
  rfpTags,
  pastProjectTags,
  contractorIndustries,
  contractorSubIndustries,
}: KeywordsInputs): KeywordsResult {
  const contractorTerms = unique(
    [
      ...pastProjectTags,
      ...contractorIndustries,
      ...contractorSubIndustries,
    ]
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );

  if (contractorTerms.length === 0) {
    return {
      isNull: true,
      factor: {
        score: 0,
        reason:
          "Skipped: contractor has no tags / industries / sub-industries on file.",
        matched_terms: [],
      },
    };
  }

  const rfpBlob = [
    rfpTitle,
    rfpDescription ?? "",
    rfpTags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  // Whole-word match: build a regex per term escaped for safety.
  const matched = contractorTerms.filter((term) => wholeWordMatch(rfpBlob, term));

  const fraction = matched.length / contractorTerms.length;
  // Cap the bonus: matching 30% of terms is already a strong signal — bound to 100.
  const score = Math.min(100, Math.round(fraction * 250));

  if (matched.length === 0) {
    return {
      isNull: false,
      factor: {
        score: 0,
        reason: "No contractor industries or tags appear in this RFP.",
        matched_terms: [],
      },
    };
  }

  return {
    isNull: false,
    factor: {
      score,
      reason: `Matched ${matched.length} of ${contractorTerms.length} contractor terms in RFP text/tags.`,
      matched_terms: matched,
    },
  };
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWordMatch(haystack: string, term: string): boolean {
  // Use non-word boundary; works for multi-word terms too.
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(term)}(?:$|[^a-z0-9])`, "i");
  return re.test(haystack);
}

const STOPWORDS = new Set([
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "a",
  "an",
  "is",
  "it",
  "as",
  "by",
  "general",
  "services",
  "solutions",
  "systems",
  "technology",
]);
