"use client";

import {
  startTransition,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useDashboard } from "@/context/DashboardContext";

function FunnelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function RfpSidebar() {
  const { searchQuery, setSearchQuery, rfpFilter, setRfpFilter, loadedRfps } =
    useDashboard();
  const [draftFilter, setDraftFilter] = useState({
    tag: rfpFilter.tag ?? "",
    dateFrom: rfpFilter.dateFrom ?? "",
    dateTo: rfpFilter.dateTo ?? "",
    priceMin: rfpFilter.priceMin?.toString() ?? "",
    priceMax: rfpFilter.priceMax?.toString() ?? "",
  });

  // Track active filter count
  const activeFilterCount = Object.values(rfpFilter).filter(v => v !== undefined && v !== "").length;

  useEffect(() => {
    startTransition(() => {
      setDraftFilter({
        tag: rfpFilter.tag ?? "",
        dateFrom: rfpFilter.dateFrom ?? "",
        dateTo: rfpFilter.dateTo ?? "",
        priceMin: rfpFilter.priceMin?.toString() ?? "",
        priceMax: rfpFilter.priceMax?.toString() ?? "",
      });
    });
  }, [rfpFilter]);

  const allTags = Array.from(
    new Set(loadedRfps.flatMap((rfp) => rfp.tags)),
  ).sort();

  const applyFilter = () => {
    setRfpFilter({
      tag: draftFilter.tag || undefined,
      dateFrom: draftFilter.dateFrom || undefined,
      dateTo: draftFilter.dateTo || undefined,
      priceMin: draftFilter.priceMin ? Number(draftFilter.priceMin) : undefined,
      priceMax: draftFilter.priceMax ? Number(draftFilter.priceMax) : undefined,
    });
  };

  const clearFilter = () => {
    setDraftFilter({ tag: "", dateFrom: "", dateTo: "", priceMin: "", priceMax: "" });
    setRfpFilter({});
  };

  const removeFilter = (key: keyof typeof draftFilter) => {
    const updated = { ...draftFilter, [key]: "" };
    setDraftFilter(updated);
    setRfpFilter({
      tag: updated.tag || undefined,
      dateFrom: updated.dateFrom || undefined,
      dateTo: updated.dateTo || undefined,
      priceMin: updated.priceMin ? Number(updated.priceMin) : undefined,
      priceMax: updated.priceMax ? Number(updated.priceMax) : undefined,
    });
  };

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm text-govbid-text outline-none transition placeholder:text-govbid-text-muted focus:border-govbid-primary focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-govbid-primary";

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-govbid-border/60 bg-govbid-surface p-4 lg:w-[280px] lg:border-b-0 lg:p-5">
      <details className="group rounded-xl lg:hidden" open>
        <summary className="cursor-pointer list-none rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm font-semibold text-govbid-text [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <FunnelIcon />
              Search &amp; filters
              {activeFilterCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-govbid-primary text-xs font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </span>
            <span className="text-govbid-text-muted group-open:rotate-180">▼</span>
          </span>
        </summary>
        <div className="mt-3 space-y-4">
          <SearchCardBody
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            draftFilter={draftFilter}
            setDraftFilter={setDraftFilter}
            allTags={allTags}
            applyFilter={applyFilter}
            clearFilter={clearFilter}
            removeFilter={removeFilter}
            activeFilterCount={activeFilterCount}
            inputClass={inputClass}
          />
        </div>
      </details>

      <div className="hidden rounded-xl border border-govbid-border bg-govbid-surface p-4 lg:block">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-govbid-text">
          <FunnelIcon />
          Search &amp; filters
          {activeFilterCount > 0 && (
            <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-govbid-primary text-xs font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
        <SearchCardBody
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          draftFilter={draftFilter}
          setDraftFilter={setDraftFilter}
          allTags={allTags}
          applyFilter={applyFilter}
          clearFilter={clearFilter}
          removeFilter={removeFilter}
          activeFilterCount={activeFilterCount}
          inputClass={inputClass}
        />
      </div>
    </aside>
  );
}

function SearchCardBody({
  searchQuery,
  setSearchQuery,
  draftFilter,
  setDraftFilter,
  allTags,
  applyFilter,
  clearFilter,
  removeFilter,
  activeFilterCount,
  inputClass,
}: {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  draftFilter: {
    tag: string;
    dateFrom: string;
    dateTo: string;
    priceMin: string;
    priceMax: string;
  };
  setDraftFilter: Dispatch<
    SetStateAction<{
      tag: string;
      dateFrom: string;
      dateTo: string;
      priceMin: string;
      priceMax: string;
    }>
  >;
  allTags: string[];
  applyFilter: () => void;
  clearFilter: () => void;
  removeFilter: (key: keyof typeof draftFilter) => void;
  activeFilterCount: number;
  inputClass: string;
}) {
  return (
    <div className="space-y-4">
      {/* Search */}
      <label className="block text-xs font-medium text-govbid-text-muted">
        <span className="flex items-center gap-1.5 text-govbid-text">
          <SearchIcon />
          Search
        </span>
        <input
          id="search-bar"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="RFP title, agency, keywords…"
          className={inputClass}
        />
      </label>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="space-y-2 border-t border-govbid-border pt-3">
          <p className="text-xs font-medium text-govbid-text-muted">Active filters:</p>
          <div className="flex flex-wrap gap-2">
            {draftFilter.tag && (
              <div className="inline-flex items-center gap-2 rounded-full bg-govbid-primary-muted px-3 py-1 text-sm">
                <span className="text-govbid-text">{draftFilter.tag}</span>
                <button
                  onClick={() => removeFilter("tag")}
                  className="text-govbid-text-muted hover:text-govbid-text"
                  aria-label={`Remove ${draftFilter.tag} filter`}
                >
                  <XIcon />
                </button>
              </div>
            )}
            {draftFilter.dateFrom && (
              <div className="inline-flex items-center gap-2 rounded-full bg-govbid-primary-muted px-3 py-1 text-sm">
                <span className="text-govbid-text">From {draftFilter.dateFrom}</span>
                <button
                  onClick={() => removeFilter("dateFrom")}
                  className="text-govbid-text-muted hover:text-govbid-text"
                  aria-label="Remove start date filter"
                >
                  <XIcon />
                </button>
              </div>
            )}
            {draftFilter.dateTo && (
              <div className="inline-flex items-center gap-2 rounded-full bg-govbid-primary-muted px-3 py-1 text-sm">
                <span className="text-govbid-text">To {draftFilter.dateTo}</span>
                <button
                  onClick={() => removeFilter("dateTo")}
                  className="text-govbid-text-muted hover:text-govbid-text"
                  aria-label="Remove end date filter"
                >
                  <XIcon />
                </button>
              </div>
            )}
            {draftFilter.priceMin && (
              <div className="inline-flex items-center gap-2 rounded-full bg-govbid-primary-muted px-3 py-1 text-sm">
                <span className="text-govbid-text">Min ${draftFilter.priceMin}</span>
                <button
                  onClick={() => removeFilter("priceMin")}
                  className="text-govbid-text-muted hover:text-govbid-text"
                  aria-label="Remove minimum price filter"
                >
                  <XIcon />
                </button>
              </div>
            )}
            {draftFilter.priceMax && (
              <div className="inline-flex items-center gap-2 rounded-full bg-govbid-primary-muted px-3 py-1 text-sm">
                <span className="text-govbid-text">Max ${draftFilter.priceMax}</span>
                <button
                  onClick={() => removeFilter("priceMax")}
                  className="text-govbid-text-muted hover:text-govbid-text"
                  aria-label="Remove maximum price filter"
                >
                  <XIcon />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter Section */}
      <div className="space-y-3 border-t border-govbid-border pt-3">
        <p className="text-xs font-medium text-govbid-text-muted">Filter by</p>

        {/* Topic Tag */}
        <label className="block text-xs font-medium text-govbid-text-muted">
          Topic tag
          <select
            id="filter-button"
            value={draftFilter.tag}
            onChange={(event) =>
              setDraftFilter((prev) => ({ ...prev, tag: event.target.value }))
            }
            className={inputClass}
          >
            <option value="">Any topic</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>

        {/* Date Range */}
        <div>
          <p className="mb-2 text-xs font-medium text-govbid-text-muted">Due date range</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <label className="block text-xs font-medium text-govbid-text-muted">
              From
              <input
                type="date"
                value={draftFilter.dateFrom}
                onChange={(event) =>
                  setDraftFilter((prev) => ({
                    ...prev,
                    dateFrom: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>
            <label className="block text-xs font-medium text-govbid-text-muted">
              To
              <input
                type="date"
                value={draftFilter.dateTo}
                onChange={(event) =>
                  setDraftFilter((prev) => ({
                    ...prev,
                    dateTo: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>
          </div>
        </div>

        {/* Price Range */}
        <div>
          <p className="mb-2 text-xs font-medium text-govbid-text-muted">Contract value</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <label className="block text-xs font-medium text-govbid-text-muted">
              Min ($)
              <input
                type="number"
                min={0}
                value={draftFilter.priceMin}
                onChange={(event) =>
                  setDraftFilter((prev) => ({
                    ...prev,
                    priceMin: event.target.value,
                  }))
                }
                placeholder="0"
                className={inputClass}
              />
            </label>
            <label className="block text-xs font-medium text-govbid-text-muted">
              Max ($)
              <input
                type="number"
                min={0}
                value={draftFilter.priceMax}
                onChange={(event) =>
                  setDraftFilter((prev) => ({
                    ...prev,
                    priceMax: event.target.value,
                  }))
                }
                placeholder="Any"
                className={inputClass}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-govbid-border pt-3">
        <button
          type="button"
          onClick={applyFilter}
          className="govbid-btn-primary rounded-lg px-4 py-2 text-sm flex-1"
        >
          Apply filters
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilter}
            className="rounded-lg border border-govbid-border bg-govbid-surface px-4 py-2 text-sm font-semibold text-govbid-text transition hover:bg-govbid-primary-muted/40"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
