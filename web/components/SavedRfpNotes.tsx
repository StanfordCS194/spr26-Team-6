"use client";

import { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";

export function SavedRfpNotes({
  rfpId,
  saved,
}: {
  rfpId: string;
  saved: boolean;
}) {
  const { savedRfpRecords, updateSavedRfpNotes } = useDashboard();
  const initialNotes =
    savedRfpRecords.find((record) => record.rfpId === rfpId)?.notes.trim() ?? "";
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
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

  if (!saved) {
    return (
      <section className="rounded-xl border border-dashed border-govbid-border bg-govbid-elevated/50 p-8 text-center">
        <h2 className="text-base font-semibold text-govbid-text">
          Save this opportunity to add notes
        </h2>
        <p className="mt-2 text-sm text-govbid-text-muted">
          Personal notes are stored with your saved opportunities.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-govbid-border bg-govbid-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <label
            htmlFor={`saved-rfp-notes-${rfpId}`}
            className="text-sm font-semibold text-govbid-text"
          >
            Personal notes
          </label>
          <p className="mt-1 text-xs text-govbid-text-muted">
            Keep reminders, questions, and follow-up items for this opportunity.
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
        rows={4}
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
    </section>
  );
}
