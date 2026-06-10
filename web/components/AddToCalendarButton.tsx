"use client";

import { useDashboard } from "@/context/DashboardContext";
import { captureEvent } from "@/lib/analytics";
import {
  downloadRfpDeadlineCalendar,
  hasCalendarDeadline,
} from "@/lib/calendar";
import type { Rfp } from "@/lib/types";

function CalendarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}

export function AddToCalendarButton({
  rfp,
  compact = false,
}: {
  rfp: Rfp;
  compact?: boolean;
}) {
  const { showToast } = useDashboard();
  const available = hasCalendarDeadline(rfp);
  const label = available
    ? "Add deadline to calendar"
    : "Deadline date unavailable";

  const handleClick = () => {
    try {
      downloadRfpDeadlineCalendar(rfp);
      captureEvent("rfp_deadline_calendar_downloaded", {
        rfp_id: rfp.id,
        due_date: rfp.dueDate,
      });
      showToast("Calendar file downloaded.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create calendar file.";
      showToast(message);
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!available}
        aria-label={label}
        title={label}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-govbid-border bg-govbid-surface text-govbid-text-muted transition hover:border-govbid-border-strong hover:text-govbid-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!available}
      title={label}
      className="inline-flex items-center gap-2 rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm font-medium text-govbid-text transition hover:bg-govbid-primary-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <CalendarIcon />
      Add deadline to calendar
    </button>
  );
}
