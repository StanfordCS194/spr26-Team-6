import type { Rfp } from "@/lib/types";

/** Capability / stack tags from the processor classifier (see processor/tag_vocab.py). */
export const INDUSTRY_TAGS: readonly string[] = [
  "IT Systems",
  "Software",
  "System Development",
  "Cloud",
  "SaaS",
  "Cybersecurity",
  "Data",
  "GIS",
  "Hardware",
  "Electrical",
  "Infrastructure",
] as const;

/** Sector / subject-matter tags from the processor classifier. */
export const TOPIC_TAGS: readonly string[] = [
  "Health Services",
  "Medical Imaging",
  "Fire Services",
  "Forestry",
  "Construction",
  "Servers",
  "Logistics",
  "Transportation",
  "Environment",
  "Water",
  "Cannabis",
  "Corrections",
  "Legal & Courts",
  "Finance",
  "Operations",
  "Procurement",
  "Government",
  "Training",
  "Research",
  "Consulting",
] as const;

const INDUSTRY_TAG_SET = new Set<string>(INDUSTRY_TAGS);
const TOPIC_TAG_SET = new Set<string>(TOPIC_TAGS);

function tagMatches(rfp: Rfp, value: string): boolean {
  const needle = value.toLowerCase();
  return rfp.tags.some((tag) => tag.toLowerCase() === needle);
}

export function rfpMatchesLocationFilter(rfp: Rfp, location: string): boolean {
  const needle = location.toLowerCase();
  if (rfp.location.toLowerCase() === needle) return true;
  return tagMatches(rfp, location);
}

export function rfpMatchesIndustryFilter(rfp: Rfp, industry: string): boolean {
  return tagMatches(rfp, industry);
}

export function rfpMatchesTopicFilter(rfp: Rfp, topic: string): boolean {
  return tagMatches(rfp, topic);
}

/** Tags present in the catalog, grouped and ordered by the curated taxonomy. */
export function filterOptionsFromRfps(rfps: Rfp[]): {
  locations: string[];
  industries: string[];
  topics: string[];
} {
  const tagSet = new Set(rfps.flatMap((r) => r.tags));
  const locationSet = new Set(
    rfps
      .map((r) => r.location.trim())
      .filter((loc) => loc && loc !== "—"),
  );

  for (const rfp of rfps) {
    for (const tag of rfp.tags) {
      if (!INDUSTRY_TAG_SET.has(tag) && !TOPIC_TAG_SET.has(tag)) {
        locationSet.add(tag);
      }
    }
  }

  return {
    locations: [...locationSet].sort((a, b) => a.localeCompare(b)),
    industries: INDUSTRY_TAGS.filter((tag) => tagSet.has(tag)),
    topics: TOPIC_TAGS.filter((tag) => tagSet.has(tag)),
  };
}
