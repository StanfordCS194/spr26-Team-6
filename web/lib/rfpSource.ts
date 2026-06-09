import type { RfpSource } from "@/lib/database.types";

export type { RfpSource };

export const SOURCE_DISPLAY: Record<RfpSource, string> = {
  "Cal eProcure": "Cal eProcure",
  "BidNet Direct": "BidNet",
  PlanetBids: "PlanetBids",
  "sam.gov": "SAM.gov",
  other: "Other",
};

export const SOURCE_STYLE: Record<
  RfpSource,
  { bg: string; text: string; border: string }
> = {
  "Cal eProcure": {
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200",
  },
  "BidNet Direct": {
    bg: "bg-orange-50",
    text: "text-orange-800",
    border: "border-orange-200",
  },
  PlanetBids: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
  },
  "sam.gov": {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
  },
  other: {
    bg: "bg-violet-50",
    text: "text-violet-800",
    border: "border-violet-200",
  },
};

/** Sources shown in sidebar filter chips (excludes generic `other` when empty). */
export const FILTERABLE_SOURCES: RfpSource[] = [
  "Cal eProcure",
  "BidNet Direct",
  "PlanetBids",
  "sam.gov",
];

export function countBySource(
  rfps: readonly { source: RfpSource }[],
): Partial<Record<RfpSource, number>> {
  const counts: Partial<Record<RfpSource, number>> = {};
  for (const r of rfps) {
    counts[r.source] = (counts[r.source] ?? 0) + 1;
  }
  return counts;
}

export function distinctSourceCount(
  counts: Partial<Record<RfpSource, number>>,
): number {
  return Object.values(counts).filter((n) => (n ?? 0) > 0).length;
}

export function formatSourceBreakdown(
  counts: Partial<Record<RfpSource, number>>,
): string {
  return FILTERABLE_SOURCES.filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => `${SOURCE_DISPLAY[s]} ${counts[s]}`)
    .join(" · ");
}
