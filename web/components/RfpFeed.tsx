"use client";

import { getListCardLayout } from "@/lib/analytics";
import { useDashboard } from "@/context/DashboardContext";
import { RfpCard } from "./RfpCard";

function filtersActive(
  q: string,
  filter: {
    tag?: string;
    dateFrom?: string;
    dateTo?: string;
    priceMin?: number;
    priceMax?: number;
  },
) {
  return (
    q.trim() !== "" ||
    Boolean(filter.tag) ||
    Boolean(filter.dateFrom) ||
    Boolean(filter.dateTo) ||
    typeof filter.priceMin === "number" ||
    typeof filter.priceMax === "number"
  );
}

export function RfpFeed() {
  const listLayout = getListCardLayout();
  const {
    feedRfps,
    selectedRfpId,
    selectRfp,
    activeNav,
    loadedRfps,
    filteredRfps,
    searchQuery,
    rfpFilter,
    isSaved,
    toggleSaveRfp,
  } = useDashboard();

  const handleFavoriteToggle = (id: string) => {
    void toggleSaveRfp(id);
  };

  if (activeNav === "history") {
    return (
      <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-2 bg-govbid-surface px-6 py-12 text-center">
        <p className="max-w-sm text-sm font-medium text-govbid-text">History</p>
        <p className="max-w-sm text-sm text-govbid-text-muted">
          Recently viewed RFPs will appear here once session tracking is connected.
        </p>
      </div>
    );
  }

  return (
    <div id="rfp-feed" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-govbid-surface p-4 lg:gap-4 lg:p-5">
      {feedRfps.map((rfp) => (
        <RfpCard
          key={rfp.id}
          rfp={rfp}
          layout={listLayout}
          active={selectedRfpId === rfp.id}
          onSelect={() => selectRfp(rfp.id)}
          isFavorited={isSaved(rfp.id)}
          onFavoriteToggle={handleFavoriteToggle}
        />
      ))}
      {feedRfps.length === 0 && (
        <p className="rounded-xl border border-dashed border-govbid-border bg-govbid-surface/80 px-4 py-10 text-center text-sm leading-relaxed text-govbid-text-muted">
          {activeNav === "saved"
            ? "No saved opportunities match these filters. Save RFPs from the detail view or clear filters."
            : loadedRfps.length === 0
              ? "Supabase returned no rows for this query (status = active and is_relevant = true). Add or update RFPs in the database, or set is_relevant / status so they match."
              : filtersActive(searchQuery, rfpFilter) &&
                  filteredRfps.length === 0
                ? `Your catalog has ${loadedRfps.length} RFP(s) from the database, but search and sidebar filters hide all of them. Clear filters or broaden your search.`
                : "No RFPs match your search. Try different keywords or filters."}
        </p>
      )}
    </div>
  );
}
