"use client";

import {
  useDashboard,
  type RfpFilter,
  type RfpSortBy,
} from "@/context/DashboardContext";

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

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      {direction === "left" ? (
        <path d="M15 18l-6-6 6-6" />
      ) : (
        <path d="M9 18l6-6-6-6" />
      )}
    </svg>
  );
}

function FiltersPanelToggle({
  expanded,
  onClick,
  activeFilterCount,
  className = "",
}: {
  expanded: boolean;
  onClick: () => void;
  activeFilterCount: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls="walkthrough-rfp-filters-panel"
      title={expanded ? "Hide search and filters" : "Show search and filters"}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-govbid-border bg-govbid-surface px-2 py-1.5 text-xs font-semibold text-govbid-text transition hover:bg-govbid-primary-muted/40 ${className}`}
    >
      {!expanded && <FunnelIcon />}
      <span className="whitespace-nowrap">
        {expanded ? "Hide" : "Filters"}
      </span>
      {!expanded && activeFilterCount > 0 && (
        <span className="flex size-5 items-center justify-center rounded-full bg-govbid-primary text-[10px] font-bold text-white">
          {activeFilterCount}
        </span>
      )}
      {expanded ? (
        <ChevronIcon direction="left" />
      ) : (
        <ChevronIcon direction="right" />
      )}
    </button>
  );
}

export function RfpSidebar() {
  const {
    searchQuery,
    setSearchQuery,
    rfpFilter,
    setRfpFilter,
    sortBy,
    setSortBy,
    loadedRfps,
    filtersPanelVisible,
    toggleFiltersPanel,
  } = useDashboard();

  const activeFilterCount = Object.values(rfpFilter).filter(
    (v) => v !== undefined && v !== "",
  ).length;

  const allTags = Array.from(
    new Set(loadedRfps.flatMap((rfp) => rfp.tags)),
  ).sort();

  const mergeRfpFilter = (patch: Partial<RfpFilter>) => {
    setRfpFilter({ ...rfpFilter, ...patch });
  };

  const clearFilter = () => {
    setRfpFilter({});
  };

  const removeFilter = (key: keyof RfpFilter) => {
    setRfpFilter({ ...rfpFilter, [key]: undefined });
  };

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm text-govbid-text outline-none transition placeholder:text-govbid-text-muted focus:border-govbid-primary focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-govbid-primary";

  if (!filtersPanelVisible) {
    return (
      <aside
        id="walkthrough-rfp-filters"
        className="flex w-full shrink-0 flex-col border-b border-govbid-border/60 bg-govbid-surface p-3 lg:w-auto lg:border-b-0 lg:border-r lg:px-2 lg:py-4"
      >
        <FiltersPanelToggle
          expanded={false}
          onClick={toggleFiltersPanel}
          activeFilterCount={activeFilterCount}
          className="w-full justify-center lg:w-auto lg:flex-col lg:px-2 lg:py-3"
        />
      </aside>
    );
  }

  return (
    <aside
      id="walkthrough-rfp-filters"
      className="flex w-full shrink-0 flex-col gap-4 border-b border-govbid-border/60 bg-govbid-surface p-4 lg:min-h-0 lg:w-[280px] lg:border-b-0 lg:border-r lg:border-govbid-border/60 lg:p-5"
    >
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
            <span
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <FiltersPanelToggle
                expanded
                onClick={toggleFiltersPanel}
                activeFilterCount={activeFilterCount}
              />
              <span className="text-govbid-text-muted group-open:rotate-180">▼</span>
            </span>
          </span>
        </summary>
        <div id="walkthrough-rfp-filters-panel" className="mt-3 space-y-4 lg:hidden">
          <SearchCardBody
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            rfpFilter={rfpFilter}
            allTags={allTags}
            sortBy={sortBy}
            setSortBy={setSortBy}
            mergeRfpFilter={mergeRfpFilter}
            clearFilter={clearFilter}
            removeFilter={removeFilter}
            activeFilterCount={activeFilterCount}
            inputClass={inputClass}
          />
        </div>
      </details>

      <div
        id="walkthrough-rfp-filters-panel-desktop"
        className="hidden rounded-xl border border-govbid-border bg-govbid-surface p-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-govbid-text">
          <FunnelIcon />
          <span>Search &amp; filters</span>
          {activeFilterCount > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-govbid-primary text-xs font-bold text-white">
              {activeFilterCount}
            </span>
          )}
          <FiltersPanelToggle
            expanded
            onClick={toggleFiltersPanel}
            activeFilterCount={activeFilterCount}
            className="ml-auto"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SearchCardBody
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            rfpFilter={rfpFilter}
            allTags={allTags}
            sortBy={sortBy}
            setSortBy={setSortBy}
            mergeRfpFilter={mergeRfpFilter}
            clearFilter={clearFilter}
            removeFilter={removeFilter}
            activeFilterCount={activeFilterCount}
            inputClass={inputClass}
          />
        </div>
      </div>
    </aside>
  );
}

function SearchCardBody({
  searchQuery,
  setSearchQuery,
  rfpFilter,
  allTags,
  sortBy,
  setSortBy,
  mergeRfpFilter,
  clearFilter,
  removeFilter,
  activeFilterCount,
  inputClass,
}: {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  rfpFilter: RfpFilter;
  allTags: string[];
  sortBy: RfpSortBy;
  setSortBy: (sort: RfpSortBy) => void;
  mergeRfpFilter: (patch: Partial<RfpFilter>) => void;
  clearFilter: () => void;
  removeFilter: (key: keyof RfpFilter) => void;
  activeFilterCount: number;
  inputClass: string;
}) {
  const sortButtonClass = (active: boolean) =>
    active
      ? "flex-1 rounded-lg border border-govbid-primary bg-govbid-primary px-3 py-2 text-xs font-semibold text-white transition"
      : "flex-1 rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-xs font-semibold text-govbid-text-muted transition hover:border-govbid-primary/40 hover:text-govbid-text";
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

      {/* Sort controls */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-govbid-text-muted">Sort</p>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={sortBy === "score"}
            onClick={() => setSortBy("score")}
            className={sortButtonClass(sortBy === "score")}
          >
            Sort by Score
          </button>
          <button
            type="button"
            aria-pressed={sortBy === "date"}
            onClick={() => setSortBy("date")}
            className={sortButtonClass(sortBy === "date")}
          >
            Sort by Date
          </button>
        </div>
      </div>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="space-y-2 border-t border-govbid-border pt-3">
          <p className="text-xs font-medium text-govbid-text-muted">Active filters:</p>
          <div className="flex flex-wrap gap-2">
            {rfpFilter.tag && (
              <div className="inline-flex items-center gap-2 rounded-full bg-govbid-primary-muted px-3 py-1 text-sm">
                <span className="text-govbid-text">{rfpFilter.tag}</span>
                <button
                  type="button"
                  onClick={() => removeFilter("tag")}
                  className="text-govbid-text-muted hover:text-govbid-text"
                  aria-label={`Remove ${rfpFilter.tag} filter`}
                >
                  <XIcon />
                </button>
              </div>
            )}
            {rfpFilter.dateFrom && (
              <div className="inline-flex items-center gap-2 rounded-full bg-govbid-primary-muted px-3 py-1 text-sm">
                <span className="text-govbid-text">From {rfpFilter.dateFrom}</span>
                <button
                  type="button"
                  onClick={() => removeFilter("dateFrom")}
                  className="text-govbid-text-muted hover:text-govbid-text"
                  aria-label="Remove start date filter"
                >
                  <XIcon />
                </button>
              </div>
            )}
            {rfpFilter.dateTo && (
              <div className="inline-flex items-center gap-2 rounded-full bg-govbid-primary-muted px-3 py-1 text-sm">
                <span className="text-govbid-text">To {rfpFilter.dateTo}</span>
                <button
                  type="button"
                  onClick={() => removeFilter("dateTo")}
                  className="text-govbid-text-muted hover:text-govbid-text"
                  aria-label="Remove end date filter"
                >
                  <XIcon />
                </button>
              </div>
            )}
            {typeof rfpFilter.priceMin === "number" && (
              <div className="inline-flex items-center gap-2 rounded-full bg-govbid-primary-muted px-3 py-1 text-sm">
                <span className="text-govbid-text">Min ${rfpFilter.priceMin}</span>
                <button
                  type="button"
                  onClick={() => removeFilter("priceMin")}
                  className="text-govbid-text-muted hover:text-govbid-text"
                  aria-label="Remove minimum price filter"
                >
                  <XIcon />
                </button>
              </div>
            )}
            {typeof rfpFilter.priceMax === "number" && (
              <div className="inline-flex items-center gap-2 rounded-full bg-govbid-primary-muted px-3 py-1 text-sm">
                <span className="text-govbid-text">Max ${rfpFilter.priceMax}</span>
                <button
                  type="button"
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
            value={rfpFilter.tag ?? ""}
            onChange={(event) =>
              mergeRfpFilter({ tag: event.target.value || undefined })
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
                value={rfpFilter.dateFrom ?? ""}
                onChange={(event) =>
                  mergeRfpFilter({ dateFrom: event.target.value || undefined })
                }
                className={inputClass}
              />
            </label>
            <label className="block text-xs font-medium text-govbid-text-muted">
              To
              <input
                type="date"
                value={rfpFilter.dateTo ?? ""}
                onChange={(event) =>
                  mergeRfpFilter({ dateTo: event.target.value || undefined })
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
                value={rfpFilter.priceMin ?? ""}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "") {
                    mergeRfpFilter({ priceMin: undefined });
                    return;
                  }
                  const n = Number(raw);
                  mergeRfpFilter({
                    priceMin: Number.isFinite(n) ? n : undefined,
                  });
                }}
                placeholder="0"
                className={inputClass}
              />
            </label>
            <label className="block text-xs font-medium text-govbid-text-muted">
              Max ($)
              <input
                type="number"
                min={0}
                value={rfpFilter.priceMax ?? ""}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "") {
                    mergeRfpFilter({ priceMax: undefined });
                    return;
                  }
                  const n = Number(raw);
                  mergeRfpFilter({
                    priceMax: Number.isFinite(n) ? n : undefined,
                  });
                }}
                placeholder="Any"
                className={inputClass}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Clear */}
      {activeFilterCount > 0 && (
        <div className="border-t border-govbid-border pt-3">
          <button
            type="button"
            onClick={clearFilter}
            className="w-full rounded-lg border border-govbid-border bg-govbid-surface px-4 py-2 text-sm font-semibold text-govbid-text transition hover:bg-govbid-primary-muted/40"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
