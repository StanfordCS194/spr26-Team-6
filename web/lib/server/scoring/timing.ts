import type { CompatibilityFactors } from "@/lib/types";

export type TimingInputs = {
  dueDate: string | null;
  preferredResponseWindowDays: number | null;
  now?: Date;
};

export type TimingResult = {
  factor: CompatibilityFactors["timing"];
  isNull: boolean;
};

/**
 * Cat 1 — Date/timing match.
 * 1 if (due_date - now) >= preferred_response_window_days, else 0.
 * Returns isNull=true when either input is missing so the orchestrator can
 * drop this factor from the weighting.
 */
export function scoreTiming({
  dueDate,
  preferredResponseWindowDays,
  now,
}: TimingInputs): TimingResult {
  if (!dueDate || preferredResponseWindowDays == null) {
    return {
      isNull: true,
      factor: {
        score: 0,
        reason:
          "Skipped: contractor has no preferred response window or RFP has no due date.",
      },
    };
  }

  const due = new Date(dueDate).getTime();
  const ref = (now ?? new Date()).getTime();
  const daysLeft = (due - ref) / 86_400_000;
  const ok = daysLeft >= preferredResponseWindowDays;

  return {
    isNull: false,
    factor: {
      score: ok ? 1 : 0,
      reason: ok
        ? `Due in ${daysLeft.toFixed(1)} days; meets the ${preferredResponseWindowDays}-day response window.`
        : `Due in ${daysLeft.toFixed(1)} days; below the ${preferredResponseWindowDays}-day response window.`,
    },
  };
}
