import type { CompatibilityFactors } from "@/lib/types";

export type AwardInputs = {
  contractorMin: number | null;
  contractorMax: number | null;
  rfpMin: number | null;
  rfpMax: number | null;
};

export type AwardResult = {
  factor: CompatibilityFactors["award"];
  isNull: boolean;
};

/**
 * Cat 4 — Award match.
 *   1   if contractor range fully contains RFP range (or vice versa)
 *   0.5 if the ranges overlap at all
 *   0   if they are disjoint
 * If either side has no range at all the factor is null (dropped from weighting).
 */
export function scoreAward({
  contractorMin,
  contractorMax,
  rfpMin,
  rfpMax,
}: AwardInputs): AwardResult {
  const cMin = contractorMin ?? null;
  const cMax = contractorMax ?? null;
  const rMin = rfpMin ?? null;
  const rMax = rfpMax ?? null;

  const contractorHasRange = cMin != null || cMax != null;
  const rfpHasRange = rMin != null || rMax != null;

  if (!contractorHasRange || !rfpHasRange) {
    return {
      isNull: true,
      factor: {
        score: 0,
        reason:
          "Skipped: contractor or RFP is missing a contract amount range.",
      },
    };
  }

  // Treat missing bounds as -Inf / +Inf
  const cLo = cMin ?? -Infinity;
  const cHi = cMax ?? Infinity;
  const rLo = rMin ?? -Infinity;
  const rHi = rMax ?? Infinity;

  const disjoint = rHi < cLo || rLo > cHi;
  if (disjoint) {
    return {
      isNull: false,
      factor: {
        score: 0,
        reason: `RFP range [${fmt(rLo)}, ${fmt(rHi)}] is disjoint from contractor range [${fmt(cLo)}, ${fmt(cHi)}].`,
      },
    };
  }

  const rfpInside = rLo >= cLo && rHi <= cHi;
  const contractorInside = cLo >= rLo && cHi <= rHi;
  if (rfpInside || contractorInside) {
    return {
      isNull: false,
      factor: {
        score: 1,
        reason: `Full overlap between RFP [${fmt(rLo)}, ${fmt(rHi)}] and contractor [${fmt(cLo)}, ${fmt(cHi)}].`,
      },
    };
  }

  return {
    isNull: false,
    factor: {
      score: 0.5,
      reason: `Partial overlap between RFP [${fmt(rLo)}, ${fmt(rHi)}] and contractor [${fmt(cLo)}, ${fmt(cHi)}].`,
    },
  };
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
  return `$${Math.round(n).toLocaleString()}`;
}
