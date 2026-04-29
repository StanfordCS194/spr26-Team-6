"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { RfpCard } from "./RfpCard";
import { MOCK_RFPS } from "@/lib/mockData";

export function RfpSidebar() {
  const { filteredRfps, selectedRfpId, selectRfp, rfpFilter, setRfpFilter } = useDashboard();
  const [draftFilter, setDraftFilter] = useState({
    tag: rfpFilter.tag ?? "",
    dateFrom: rfpFilter.dateFrom ?? "",
    dateTo: rfpFilter.dateTo ?? "",
    priceMin: rfpFilter.priceMin?.toString() ?? "",
    priceMax: rfpFilter.priceMax?.toString() ?? "",
  });

  useEffect(() => {
    setDraftFilter({
      tag: rfpFilter.tag ?? "",
      dateFrom: rfpFilter.dateFrom ?? "",
      dateTo: rfpFilter.dateTo ?? "",
      priceMin: rfpFilter.priceMin?.toString() ?? "",
      priceMax: rfpFilter.priceMax?.toString() ?? "",
    });
  }, [rfpFilter]);

  const allTags = Array.from(new Set(MOCK_RFPS.flatMap((rfp) => rfp.tags))).sort();

  const applyFilter = () => {
    setRfpFilter({
      tag: draftFilter.tag || undefined,
      dateFrom: draftFilter.dateFrom || undefined,
      dateTo: draftFilter.dateTo || undefined,
      priceMin: draftFilter.priceMin
        ? Number(draftFilter.priceMin)
        : undefined,
      priceMax: draftFilter.priceMax
        ? Number(draftFilter.priceMax)
        : undefined,
    });
  };

  const clearFilter = () => {
    setDraftFilter({ tag: "", dateFrom: "", dateTo: "", priceMin: "", priceMax: "" });
    setRfpFilter({});
  };

  return (
    <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Recommended RFPs
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Mock data — wire to SAM.gov + scoring pipeline later.
            </p>
          </div>
        </div>
        <details className="group mt-4 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/95">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Sort By
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Choose topic, dates, or price</span>
          </summary>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Topic tag
              </label>
              <select
                value={draftFilter.tag}
                onChange={(event) =>
                  setDraftFilter((prev) => ({ ...prev, tag: event.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">Any</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Due date from
                <input
                  type="date"
                  value={draftFilter.dateFrom}
                  onChange={(event) =>
                    setDraftFilter((prev) => ({
                      ...prev,
                      dateFrom: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Due date to
                <input
                  type="date"
                  value={draftFilter.dateTo}
                  onChange={(event) =>
                    setDraftFilter((prev) => ({
                      ...prev,
                      dateTo: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Minimum price ($)
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
                  className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Maximum price ($)
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
                  className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyFilter}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={clearFilter}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Clear
              </button>
            </div>
          </div>
        </details>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {filteredRfps.map((rfp) => (
            <RfpCard
              key={rfp.id}
              rfp={rfp}
              active={selectedRfpId === rfp.id}
              onSelect={() => selectRfp(rfp.id)}
            />
          ))}
          {filteredRfps.length === 0 && (
            <p className="px-1 text-sm text-zinc-500 dark:text-zinc-400">
              No RFPs match your search.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
