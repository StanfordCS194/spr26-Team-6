"use client";

import { useEffect, useMemo, useState } from "react";
import { getListCardLayout } from "@/lib/analytics";
import { useDashboard } from "@/context/DashboardContext";
import {
  WALKTHROUGH_CLEAR_RFP_FOCUS_EVENT,
  WALKTHROUGH_FOCUS_RFP_EVENT,
} from "@/lib/walkthroughEvents";
import { RfpCard } from "./RfpCard";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

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

  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [page, setPage] = useState(1);
  const [tourTargetRfpId, setTourTargetRfpId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [activeNav, searchQuery, rfpFilter, pageSize, feedRfps.length]);

  useEffect(() => {
    const onFocusRfp = (event: Event) => {
      const { rfpId } = (event as CustomEvent<{ rfpId: string }>).detail;
      setTourTargetRfpId(rfpId);
      const index = feedRfps.findIndex((r) => r.id === rfpId);
      if (index >= 0) {
        setPage(Math.floor(index / pageSize) + 1);
      }
    };
    const onClearFocus = () => setTourTargetRfpId(null);

    window.addEventListener(WALKTHROUGH_FOCUS_RFP_EVENT, onFocusRfp);
    window.addEventListener(WALKTHROUGH_CLEAR_RFP_FOCUS_EVENT, onClearFocus);
    return () => {
      window.removeEventListener(WALKTHROUGH_FOCUS_RFP_EVENT, onFocusRfp);
      window.removeEventListener(WALKTHROUGH_CLEAR_RFP_FOCUS_EVENT, onClearFocus);
    };
  }, [feedRfps, pageSize]);

  const totalPages = Math.max(1, Math.ceil(feedRfps.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedRfps = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return feedRfps.slice(start, start + pageSize);
  }, [feedRfps, currentPage, pageSize]);

  useEffect(() => {
    if (!tourTargetRfpId) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById("walkthrough-rfp-card-target")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tourTargetRfpId, currentPage, paginatedRfps]);

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
    <div
      id="rfp-feed"
      className="flex min-h-0 flex-1 flex-col bg-govbid-surface"
    >
      <div
        id="walkthrough-rfp-feed-list"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 lg:gap-4 lg:p-5"
      >
        {paginatedRfps.map((rfp) => (
          <div
            key={rfp.id}
            id={
              rfp.id === tourTargetRfpId
                ? "walkthrough-rfp-card-target"
                : undefined
            }
          >
            <RfpCard
              rfp={rfp}
              layout={listLayout}
              active={selectedRfpId === rfp.id}
              onSelect={() => selectRfp(rfp.id)}
              isFavorited={isSaved(rfp.id)}
              onFavoriteToggle={handleFavoriteToggle}
            />
          </div>
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

      {feedRfps.length > 0 && (
        <footer className="flex shrink-0 items-start justify-between gap-4 border-t border-govbid-border/60 bg-govbid-elevated/40 px-4 py-3 lg:px-5">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm text-govbid-text-muted">
              <span className="whitespace-nowrap">Show</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
                className="rounded-lg border border-govbid-border bg-govbid-surface px-2 py-1.5 text-sm font-medium text-govbid-text outline-none focus:border-govbid-primary focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-govbid-primary"
                aria-label="Results per page"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="whitespace-nowrap">per page</span>
            </label>
            <p className="text-sm text-govbid-text-muted">
              {feedRfps.length} result{feedRfps.length === 1 ? "" : "s"} found
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <p className="text-sm font-medium text-govbid-text">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setPage((p) => Math.max(1, Math.min(totalPages, p - 1)))
                }
                disabled={currentPage <= 1}
                className="rounded-lg border border-govbid-border bg-govbid-surface px-3 py-1.5 text-sm font-medium text-govbid-text transition hover:bg-govbid-primary-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Previous page"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((p) => Math.min(totalPages, Math.max(1, p + 1)))
                }
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-govbid-border bg-govbid-surface px-3 py-1.5 text-sm font-medium text-govbid-text transition hover:bg-govbid-primary-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
