import type { CompatibilityFactors } from "@/lib/types";

export type GeographyInputs = {
  preferredLocations: string[];
  rfpState: string | null;
  rfpLocation: string | null;
};

export type GeographyResult = {
  factor: CompatibilityFactors["geography"];
  isNull: boolean;
};

/**
 * Cat 6 — Geography match.
 * Deterministic. Compares contractor's preferred locations against the RFP's
 * `state` and `location` fields.
 *
 *   100  any preferred location is a case-insensitive substring of the RFP
 *        state/location (or vice versa), OR contractor includes "Federal" /
 *        "Nationwide" (treat as wildcard for federal opportunities).
 *    60  partial token overlap (e.g., contractor: "Northern California",
 *        RFP state: "California").
 *     0  no overlap.
 *
 * Null when contractor has no preferred locations OR the RFP carries no
 * geographic info at all.
 */
export function scoreGeography({
  preferredLocations,
  rfpState,
  rfpLocation,
}: GeographyInputs): GeographyResult {
  const prefs = preferredLocations
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.toLowerCase());

  const rfpFields = [rfpState ?? "", rfpLocation ?? ""]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (prefs.length === 0 || rfpFields.length === 0) {
    return {
      isNull: true,
      factor: {
        score: 0,
        reason:
          "Skipped: contractor has no preferred locations or RFP has no state/location.",
      },
    };
  }

  const wildcard = prefs.some(
    (p) => p === "federal" || p === "nationwide" || p === "any" || p === "*",
  );
  if (wildcard) {
    return {
      isNull: false,
      factor: {
        score: 100,
        reason: "Contractor accepts federal / nationwide opportunities.",
      },
    };
  }

  const rfpBlob = rfpFields.join(" | ");

  // Full substring match in either direction → 100.
  for (const pref of prefs) {
    if (rfpBlob.includes(pref)) {
      return {
        isNull: false,
        factor: {
          score: 100,
          reason: `Preferred location "${pref}" matches RFP location.`,
        },
      };
    }
    for (const field of rfpFields) {
      if (pref.includes(field) && field.length > 2) {
        return {
          isNull: false,
          factor: {
            score: 100,
            reason: `RFP location "${field}" is part of preferred area "${pref}".`,
          },
        };
      }
    }
  }

  // Token-level overlap → 60.
  const prefTokens = new Set(prefs.flatMap((p) => tokens(p)));
  const rfpTokens = new Set(rfpFields.flatMap((r) => tokens(r)));
  const shared = [...prefTokens].filter((t) => rfpTokens.has(t));
  if (shared.length > 0) {
    return {
      isNull: false,
      factor: {
        score: 60,
        reason: `Partial location overlap on: ${shared.join(", ")}.`,
      },
    };
  }

  return {
    isNull: false,
    factor: {
      score: 0,
      reason: `RFP location (${rfpFields.join(" / ")}) not in contractor's preferred areas (${prefs.join(", ")}).`,
    },
  };
}

const STOPWORDS = new Set([
  "the",
  "of",
  "and",
  "or",
  "state",
  "city",
  "county",
  "north",
  "south",
  "east",
  "west",
  "northern",
  "southern",
  "eastern",
  "western",
]);

function tokens(s: string): string[] {
  return s
    .split(/[^a-z0-9]+/i)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}
