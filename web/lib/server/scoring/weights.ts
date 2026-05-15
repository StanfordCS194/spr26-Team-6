import type { ScoreFactorName } from "@/lib/types";

const DEFAULT_WEIGHT = 0.2;

export const FACTOR_NAMES: ScoreFactorName[] = [
  "timing",
  "experience",
  "goals",
  "award",
  "prereqs",
];

/**
 * Drop any null factors from the weight set and renormalize the remaining
 * weights so they sum to 1.0. If every factor is null we fall back to equal
 * weights across all five to avoid divide-by-zero (caller should treat the
 * total score as meaningless in that case).
 */
export function renormalizeWeights(
  nullFactors: ScoreFactorName[],
): Record<ScoreFactorName, number> {
  const nulls = new Set(nullFactors);
  const active = FACTOR_NAMES.filter((f) => !nulls.has(f));

  if (active.length === 0) {
    return Object.fromEntries(
      FACTOR_NAMES.map((f) => [f, DEFAULT_WEIGHT]),
    ) as Record<ScoreFactorName, number>;
  }

  const w = 1 / active.length;
  return Object.fromEntries(
    FACTOR_NAMES.map((f) => [f, nulls.has(f) ? 0 : w]),
  ) as Record<ScoreFactorName, number>;
}

/**
 * Each factor sub-score is normalized to 0–1 before weighting (timing/award
 * are already in that range; experience/goals/prereqs come in as 0–100 and
 * are divided by 100 here).
 */
export function weightedTotal(
  scores: Record<ScoreFactorName, number>,
  weights: Record<ScoreFactorName, number>,
): number {
  let total = 0;
  for (const f of FACTOR_NAMES) {
    total += scores[f] * weights[f];
  }
  return Math.round(total * 100);
}
