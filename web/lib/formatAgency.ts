/**
 * Shorten long issuing-agency strings for list/detail UI. Full text should be
 * exposed via `title` on the same element for accessibility and power users.
 */
export function shortenAgencyName(agency: string, maxLen = 80): string {
  const trimmed = agency.trim();
  if (!trimmed) return "";
  const firstSegment = trimmed.split(/\s*[;|]\s*/)[0]?.trim() ?? trimmed;
  if (firstSegment.length <= maxLen) return firstSegment;
  return `${firstSegment.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}
