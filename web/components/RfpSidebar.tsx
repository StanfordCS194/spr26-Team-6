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

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm text-govbid-text outline-none transition placeholder:text-govbid-text-muted focus:border-govbid-primary focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-govbid-primary";

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-govbid-border/60 bg-govbid-surface p-4 lg:w-[280px] lg:border-b-0 lg:p-5">
      <details className="group rounded-xl lg:hidden" open>
        <summary className="cursor-pointer list-none rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm font-semibold text-govbid-text [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Search &amp; filters
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
            inputClass={inputClass}
          />
        </div>
      </details>

      <div className="hidden rounded-xl border border-govbid-border bg-govbid-surface p-4 lg:block">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-govbid-text">
          <FunnelIcon />
          Search
        </div>
        <SearchCardBody
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          draftFilter={draftFilter}
          setDraftFilter={setDraftFilter}
          allTags={allTags}
          applyFilter={applyFilter}
          clearFilter={clearFilter}
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
  inputClass: string;
}) {
  return (
    <div className="space-y-4">
      <label className="block text-xs font-medium text-govbid-text-muted">
        <span className="flex items-center gap-1.5 text-govbid-text">
          <SearchIcon />
          Keyword
        </span>
        <input
          id="search-bar"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Title, agency, tags…"
          className={inputClass}
        />
      </label>

      <div>
        <label className="text-xs font-medium text-govbid-text-muted">Topic tag</label>
        <select
          id="filter-button"
          value={draftFilter.tag}
          onChange={(event) =>
            setDraftFilter((prev) => ({ ...prev, tag: event.target.value }))
          }
          className={inputClass}
        >
          <option value="">Any</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <label className="block text-xs font-medium text-govbid-text-muted">
          Due from
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
          Due to
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <label className="block text-xs font-medium text-govbid-text-muted">
          Min price ($)
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
          Max price ($)
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

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={applyFilter}
          className="govbid-btn-primary rounded-lg px-4 py-2 text-sm"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={clearFilter}
          className="rounded-lg border border-govbid-border bg-govbid-surface px-4 py-2 text-sm font-semibold text-govbid-text transition hover:bg-govbid-primary-muted/40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
