import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { CompatibilityFactors } from "@/lib/types";

type AdminClient = SupabaseClient<Database>;

export type AgencyInputs = {
  rfpDepartment: string | null;
  pastClients: (string | null)[];
};

export type AgencyResult = {
  factor: CompatibilityFactors["agency"];
  isNull: boolean;
};

/**
 * Cat 7 — Agency familiarity.
 * Deterministic. Compares the RFP's `department` against the canonical
 * `client` values on the contractor's past projects, normalizing through
 * `public.normalize_department` when available.
 *
 *   100  exact canonical match on the full department name.
 *    70  one side is a substring of the other (e.g. parent agency overlap).
 *    40  token overlap (≥ 2 shared significant tokens).
 *     0  no overlap.
 *
 * Null when the RFP has no department or the contractor has no past clients.
 */
export async function scoreAgency(
  admin: AdminClient,
  { rfpDepartment, pastClients }: AgencyInputs,
): Promise<AgencyResult> {
  const dept = (rfpDepartment ?? "").trim();
  const clients = pastClients
    .map((c) => (c ?? "").trim())
    .filter(Boolean);

  if (!dept || clients.length === 0) {
    return {
      isNull: true,
      factor: {
        score: 0,
        reason:
          "Skipped: RFP has no department or contractor has no past clients on file.",
        matched_clients: [],
      },
    };
  }

  // Try to canonicalize both sides through department_aliases.
  const canonicalDept = await canonicalize(admin, dept);
  const canonicalClients = await Promise.all(
    clients.map((c) => canonicalize(admin, c)),
  );

  const deptLower = canonicalDept.toLowerCase();
  const deptTokens = new Set(tokens(canonicalDept));

  // 1) Exact canonical match
  const exact = canonicalClients.filter(
    (c) => c.toLowerCase() === deptLower,
  );
  if (exact.length > 0) {
    return {
      isNull: false,
      factor: {
        score: 100,
        reason: `Past work with same agency: ${exact[0]}.`,
        matched_clients: exact,
      },
    };
  }

  // 2) Substring match in either direction
  const substring = canonicalClients.filter((c) => {
    const lower = c.toLowerCase();
    return (
      (lower.length > 4 && deptLower.includes(lower)) ||
      (deptLower.length > 4 && lower.includes(deptLower))
    );
  });
  if (substring.length > 0) {
    return {
      isNull: false,
      factor: {
        score: 70,
        reason: `Past work with related agency: ${substring[0]}.`,
        matched_clients: substring,
      },
    };
  }

  // 3) Significant token overlap (≥ 2 shared tokens)
  const tokenMatches = canonicalClients.filter((c) => {
    const t = new Set(tokens(c));
    let shared = 0;
    for (const tok of deptTokens) if (t.has(tok)) shared++;
    return shared >= 2;
  });
  if (tokenMatches.length > 0) {
    return {
      isNull: false,
      factor: {
        score: 40,
        reason: `Past work shares significant agency terms with ${tokenMatches[0]}.`,
        matched_clients: tokenMatches,
      },
    };
  }

  return {
    isNull: false,
    factor: {
      score: 0,
      reason: `No past work with this agency (RFP: ${dept}).`,
      matched_clients: [],
    },
  };
}

async function canonicalize(
  admin: AdminClient,
  name: string,
): Promise<string> {
  try {
    const { data } = await admin.rpc("normalize_department", {
      input_name: name,
    });
    if (typeof data === "string" && data.trim()) return data.trim();
  } catch {
    // Fall through to the raw name.
  }
  return name.trim();
}

const STOPWORDS = new Set([
  "the",
  "of",
  "and",
  "or",
  "department",
  "dept",
  "office",
  "agency",
  "bureau",
  "division",
  "branch",
  "us",
  "united",
  "states",
  "federal",
  "state",
]);

function tokens(s: string): string[] {
  return s
    .split(/[^a-z0-9]+/i)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}
