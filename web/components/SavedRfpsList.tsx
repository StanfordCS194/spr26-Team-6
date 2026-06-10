"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Rfp } from "@/lib/types";
import {
  DEFAULT_SAVED_RFP_BID_STATUS,
  formatSavedAtLabel,
  getSavedRfpBidStatusMeta,
  reorderIdList,
  SAVED_RFP_BID_STATUSES,
  SAVED_RFP_SORT_MODES,
  showsDueDateSubtitle,
  showsSavedAtSubtitle,
  sortSavedRfps,
  writeSavedRfpSortMode,
  type SavedRfpBidStatus,
  type SavedRfpRecord,
  type SavedRfpSortMode,
} from "@/lib/savedRfpSort";

function GripIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="text-govbid-text-muted"
    >
      <circle cx="9" cy="7" r="1.5" />
      <circle cx="15" cy="7" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="17" r="1.5" />
      <circle cx="15" cy="17" r="1.5" />
    </svg>
  );
}

type Props = {
  savedRfps: Rfp[];
  savedRfpRecords: SavedRfpRecord[];
  sortMode: SavedRfpSortMode;
  onSortModeChange: (mode: SavedRfpSortMode) => void;
  onSelectRfp: (id: string) => void;
  onReorder: (orderedIds: string[]) => Promise<void>;
};

type BidStatusFilter = "all" | SavedRfpBidStatus;

export function SavedRfpsList({
  savedRfps,
  savedRfpRecords,
  sortMode,
  onSortModeChange,
  onSelectRfp,
  onReorder,
}: Props) {
  const [statusFilter, setStatusFilter] =
    useState<BidStatusFilter>("all");
  const recordsById = useMemo(
    () => new Map(savedRfpRecords.map((record) => [record.rfpId, record])),
    [savedRfpRecords],
  );
  const sorted = useMemo(
    () => sortSavedRfps(savedRfps, savedRfpRecords, sortMode),
    [savedRfps, savedRfpRecords, sortMode],
  );
  const filteredSorted = useMemo(
    () =>
      statusFilter === "all"
        ? sorted
        : sorted.filter(
            (rfp) =>
              (recordsById.get(rfp.id)?.bidStatus ??
                DEFAULT_SAVED_RFP_BID_STATUS) === statusFilter,
          ),
    [recordsById, sorted, statusFilter],
  );
  const statusCounts = useMemo(() => {
    const counts = new Map<SavedRfpBidStatus, number>();
    for (const record of savedRfpRecords) {
      counts.set(record.bidStatus, (counts.get(record.bidStatus) ?? 0) + 1);
    }
    return counts;
  }, [savedRfpRecords]);

  const sortedIds = useMemo(
    () => filteredSorted.map((r) => r.id),
    [filteredSorted],
  );
  const sortedIdsKey = sortedIds.join("|");
  const sortedById = useMemo(
    () => new Map(filteredSorted.map((r) => [r.id, r])),
    [filteredSorted],
  );

  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const draggingIdRef = useRef<string | null>(null);
  const draftIdsRef = useRef<string[] | null>(null);

  const displayIds = draftIds ?? sortedIds;
  const displayRfps = useMemo(
    () =>
      displayIds
        .map((id) => sortedById.get(id))
        .filter((r): r is Rfp => r != null),
    [displayIds, sortedById],
  );

  useEffect(() => {
    if (!draggingId) {
      setDraftIds(null);
    }
  }, [sortedIdsKey, draggingId]);

  const handleSortChange = (mode: SavedRfpSortMode) => {
    writeSavedRfpSortMode(mode);
    onSortModeChange(mode);
    setDraftIds(null);
  };

  const handleStatusFilterChange = (filter: BidStatusFilter) => {
    setStatusFilter(filter);
    setDraftIds(null);
  };

  const commitOrder = async (orderedIds: string[]) => {
    setSavingOrder(true);
    try {
      await onReorder(orderedIds);
    } catch {
      setDraftIds(null);
    } finally {
      setSavingOrder(false);
    }
  };

  const endPointerDrag = async (commit: boolean) => {
    const dragId = draggingIdRef.current;
    const finalIds = draftIdsRef.current ?? sortedIds;

    draggingIdRef.current = null;
    draftIdsRef.current = null;
    setDraggingId(null);

    if (!commit || !dragId) {
      setDraftIds(null);
      return;
    }

    const unchanged =
      finalIds.length === sortedIds.length &&
      finalIds.every((id, i) => id === sortedIds[i]);

    if (unchanged) {
      setDraftIds(null);
      return;
    }

    setDraftIds(finalIds);
    await commitOrder(finalIds);
  };

  const handleGripPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    rfpId: string,
  ) => {
    if (sortMode !== "custom" || statusFilter !== "all" || savingOrder) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const startIds = draftIds ?? sortedIds;
    draggingIdRef.current = rfpId;
    draftIdsRef.current = startIds;
    setDraggingId(rfpId);
    setDraftIds(startIds);
  };

  const handleGripPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const dragId = draggingIdRef.current;
    if (!dragId) return;

    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const row = hit?.closest<HTMLElement>("[data-rfp-id]");
    const overId = row?.dataset.rfpId;

    if (!overId || overId === dragId) return;

    setDraftIds((prev) => {
      const base = prev ?? sortedIds;
      const next = reorderIdList(base, dragId, overId);
      draftIdsRef.current = next;
      return next;
    });
  };

  const handleGripPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    void endPointerDrag(true);
  };

  const handleGripPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    void endPointerDrag(false);
  };

  if (savedRfps.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-govbid-border bg-govbid-elevated/50 p-6 text-center">
        <p className="text-sm text-govbid-text-muted">No saved opportunities yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-govbid-text-muted">
            Sort by
          </span>
          <select
            value={sortMode}
            onChange={(e) =>
              handleSortChange(e.target.value as SavedRfpSortMode)
            }
            disabled={savingOrder || draggingId != null}
            className="w-full rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm text-govbid-text outline-none focus:border-govbid-primary focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-govbid-primary disabled:opacity-60"
            aria-label="Sort saved opportunities"
          >
            {SAVED_RFP_SORT_MODES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-govbid-text-muted">
            Bid status
          </span>
          <select
            value={statusFilter}
            onChange={(event) =>
              handleStatusFilterChange(event.target.value as BidStatusFilter)
            }
            disabled={savingOrder || draggingId != null}
            className="w-full rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm text-govbid-text outline-none focus:border-govbid-primary focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-govbid-primary disabled:opacity-60"
            aria-label="Filter saved opportunities by bid status"
          >
            <option value="all">All statuses ({savedRfps.length})</option>
            {SAVED_RFP_BID_STATUSES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label} ({statusCounts.get(value) ?? 0})
              </option>
            ))}
          </select>
        </label>
      </div>

      {sortMode === "custom" && (
        <p className="text-xs text-govbid-text-muted">
          {statusFilter === "all"
            ? "Drag opportunities to reorder. "
            : "Choose All statuses to edit your custom order. "}
          {statusFilter === "all" &&
            (savingOrder
              ? "Saving order..."
              : "Order is saved to your profile.")}
        </p>
      )}

      {displayRfps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-govbid-border bg-govbid-elevated/50 p-5 text-center">
          <p className="text-sm font-medium text-govbid-text">
            No opportunities with this status
          </p>
          <p className="mt-1 text-xs text-govbid-text-muted">
            Change an opportunity&apos;s status from its Notes tab.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {displayRfps.map((rfp) => {
            const isCustom = sortMode === "custom" && statusFilter === "all";
            const isDragging = draggingId === rfp.id;
            const record = recordsById.get(rfp.id);
            const notes = record?.notes.trim();
            const bidStatus =
              record?.bidStatus ?? DEFAULT_SAVED_RFP_BID_STATUS;
            const statusMeta = getSavedRfpBidStatusMeta(bidStatus);

            return (
              <li
                key={rfp.id}
                data-rfp-id={rfp.id}
                className={`flex items-stretch gap-1 rounded-lg transition-shadow ${
                  isDragging ? "relative z-10 shadow-md" : ""
                }`}
              >
                {isCustom && (
                  <button
                    type="button"
                    onPointerDown={(e) => handleGripPointerDown(e, rfp.id)}
                    onPointerMove={handleGripPointerMove}
                    onPointerUp={handleGripPointerUp}
                    onPointerCancel={handleGripPointerCancel}
                    disabled={savingOrder}
                    className={`flex shrink-0 touch-none items-center rounded-l-lg border border-r-0 border-govbid-border bg-govbid-elevated px-2 select-none ${
                      savingOrder
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-grab active:cursor-grabbing"
                    }`}
                    aria-label={`Reorder ${rfp.title}`}
                    title="Drag to reorder"
                  >
                    <GripIcon />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (draggingId) return;
                    onSelectRfp(rfp.id);
                  }}
                  className={`saved-rfp-item min-w-0 flex-1 border bg-govbid-elevated p-3 text-left text-sm transition hover:border-govbid-primary/40 hover:bg-govbid-primary-muted/30 ${
                    isCustom ? "rounded-r-lg rounded-l-none" : "rounded-lg"
                  } ${
                    isDragging
                      ? "border-govbid-primary/50 bg-govbid-primary-muted/20"
                      : "border-govbid-border"
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 font-semibold text-govbid-text">
                      {rfp.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusMeta.badgeClassName}`}
                    >
                      {statusMeta.label}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-govbid-text-muted">
                    {rfp.agency}
                  </span>
                  {notes && (
                    <span className="mt-2 block line-clamp-2 rounded-md bg-govbid-surface px-2 py-1.5 text-xs leading-relaxed text-govbid-text-muted">
                      Note: {notes}
                    </span>
                  )}
                  {showsDueDateSubtitle(sortMode) && (
                    <span className="mt-1 block text-xs text-govbid-text-muted">
                      Due {rfp.dueDate}
                    </span>
                  )}
                  {showsSavedAtSubtitle(sortMode) &&
                    (() => {
                      const savedLabel = formatSavedAtLabel(record?.savedAt);
                      return savedLabel ? (
                        <span className="mt-1 block text-xs text-govbid-text-muted">
                          Saved {savedLabel}
                        </span>
                      ) : null;
                    })()}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
