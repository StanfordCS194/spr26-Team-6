"use client";

import { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import {
  DEFAULT_SAVED_RFP_BID_STATUS,
  SAVED_RFP_BID_STATUSES,
  type SavedRfpBidStatus,
} from "@/lib/savedRfpSort";

export function SavedRfpNotes({
  rfpId,
  saved,
}: {
  rfpId: string;
  saved: boolean;
}) {
  const {
    savedRfpRecords,
    updateSavedRfpBidStatus,
    updateSavedRfpNotes,
  } = useDashboard();
  const savedRecord = savedRfpRecords.find(
    (record) => record.rfpId === rfpId,
  );
  const initialNotes = savedRecord?.notes.trim() ?? "";
  const bidStatus =
    savedRecord?.bidStatus ?? DEFAULT_SAVED_RFP_BID_STATUS;
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] =
    useState<SavedRfpBidStatus | null>(null);
  const changed = notes.trim() !== savedNotes;

  const saveNotes = async () => {
    if (saving || !changed) return;
    const submittedNotes = notes.trim();
    setSaving(true);
    try {
      const saved = await updateSavedRfpNotes(rfpId, submittedNotes);
      if (saved) {
        setSavedNotes(submittedNotes);
      }
    } finally {
      setSaving(false);
    }
  };

  const changeBidStatus = async (status: SavedRfpBidStatus) => {
    if (updatingStatus || status === bidStatus) return;
    setUpdatingStatus(status);
    try {
      await updateSavedRfpBidStatus(rfpId, status);
    } finally {
      setUpdatingStatus(null);
    }
  };

  if (!saved) {
    return (
      <section className="rounded-xl border border-dashed border-govbid-border bg-govbid-elevated/50 p-8 text-center">
        <h2 className="text-base font-semibold text-govbid-text">
          Save this opportunity to track it
        </h2>
        <p className="mt-2 text-sm text-govbid-text-muted">
          Saved opportunities can have a bid status and private notes.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-govbid-border bg-govbid-surface">
      <div className="border-b border-govbid-border p-4">
        <div>
          <h2 className="text-sm font-semibold text-govbid-text">Bid status</h2>
          <p className="mt-1 text-xs text-govbid-text-muted">
            Track where this opportunity stands in your response workflow.
          </p>
        </div>

        <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Bid status</legend>
          {SAVED_RFP_BID_STATUSES.map((option) => {
            const active = option.value === bidStatus;
            const pending = option.value === updatingStatus;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                disabled={updatingStatus != null}
                onClick={() => void changeBidStatus(option.value)}
                className={`rounded-lg border p-3 text-left transition ${
                  active
                    ? option.activeClassName
                    : "border-govbid-border bg-govbid-elevated text-govbid-text hover:border-govbid-border-strong"
                } disabled:cursor-wait disabled:opacity-70`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span
                    className={`size-2.5 rounded-full border ${
                      active
                        ? "border-current bg-current"
                        : "border-govbid-border-strong bg-govbid-surface"
                    }`}
                    aria-hidden
                  />
                </span>
                <span className="mt-1 block text-xs opacity-80">
                  {pending ? "Updating..." : option.description}
                </span>
              </button>
            );
          })}
        </fieldset>
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <label
              htmlFor={`saved-rfp-notes-${rfpId}`}
              className="text-sm font-semibold text-govbid-text"
            >
              Personal notes
            </label>
            <p className="mt-1 text-xs text-govbid-text-muted">
              Keep reminders, questions, and follow-up items for this
              opportunity.
            </p>
          </div>
          {changed && (
            <span className="text-xs font-medium text-govbid-text-muted">
              Unsaved changes
            </span>
          )}
        </div>

        <textarea
          id={`saved-rfp-notes-${rfpId}`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add a reminder, contact, question, or next step..."
          rows={5}
          className="mt-3 w-full resize-y rounded-lg border border-govbid-border bg-govbid-elevated px-3 py-2 text-sm leading-relaxed text-govbid-text outline-none transition placeholder:text-govbid-text-muted focus:border-govbid-primary focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-govbid-primary"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-govbid-text-muted">
            Notes are private to your account.
          </p>
          <button
            type="button"
            onClick={() => void saveNotes()}
            disabled={!changed || saving}
            className="govbid-btn-primary rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save note"}
          </button>
        </div>
      </div>
    </section>
  );
}
