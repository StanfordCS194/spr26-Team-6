export type ExclusionsInputs = {
  exclusions: string[];
  rfpTitle: string;
  rfpDescription: string | null;
  rfpTags: string[];
};

export type ExclusionsResult =
  | { excluded: false }
  | { excluded: true; term: string; reason: string };

/**
 * Hard-zero gate. If any contractor exclusion term appears as a whole-word
 * match in the RFP title, description, or tags, the compatibility total is
 * forced to 0 regardless of the factor sub-scores.
 *
 * Returns `{ excluded: false }` when no exclusion applies (default).
 */
export function checkExclusions({
  exclusions,
  rfpTitle,
  rfpDescription,
  rfpTags,
}: ExclusionsInputs): ExclusionsResult {
  const terms = exclusions
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1);
  if (terms.length === 0) return { excluded: false };

  const blob = [rfpTitle, rfpDescription ?? "", rfpTags.join(" ")]
    .join(" ")
    .toLowerCase();

  for (const term of terms) {
    if (wholeWordMatch(blob, term)) {
      return {
        excluded: true,
        term,
        reason: `Excluded: RFP mentions "${term}" which is on the contractor's no-go list.`,
      };
    }
  }
  return { excluded: false };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWordMatch(haystack: string, term: string): boolean {
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(term)}(?:$|[^a-z0-9])`, "i");
  return re.test(haystack);
}
