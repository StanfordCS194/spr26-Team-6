"use client";

import type { Rfp } from "@/lib/types";
import { ScoreRing } from "./ScoreRing";

type Props = {
  rfp: Rfp;
  active: boolean;
  onSelect: () => void;
};

function dueParts(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return {
    day: d.getDate(),
    month: d.toLocaleString("en-US", { month: "long" }),
  };
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10z" />
      <circle cx="12" cy="11" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l3 2" />
    </svg>
  );
}

export function RfpCard({ rfp, active, onSelect }: Props) {
  const { day, month } = dueParts(rfp.dueDate);
  const subtitle = rfp.tags[0] ?? rfp.agency;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full gap-4 rounded-xl border bg-govbid-surface p-4 text-left shadow-[var(--govbid-shadow)] transition md:gap-5 md:p-5 ${
        active
          ? "border-govbid-primary/45 bg-govbid-primary-soft/60 shadow-[0_1px_3px_rgb(79_70_229/0.12)]"
          : "border-govbid-border hover:border-govbid-border-strong"
      }`}
    >
      <div className="flex shrink-0 flex-col items-center border-r border-govbid-border/80 pr-4 text-center md:pr-5">
        <span className="text-2xl font-bold leading-none text-govbid-text md:text-3xl">{day}</span>
        <span className="mt-1 text-xs font-medium text-govbid-text-muted">{month}</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-govbid-text md:text-base">
          {rfp.title}
        </p>
        <p className="mt-1 line-clamp-1 text-xs text-govbid-text-muted">{subtitle}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-govbid-text-muted">
          <span className="inline-flex items-center gap-1">
            <PinIcon />
            {rfp.location}
          </span>
          <span className="inline-flex items-center gap-1">
            <ClockIcon />
            Due {rfp.dueDate}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <ScoreRing score={rfp.score} size={44} stroke={3} />
        <span className="text-right text-base font-bold tabular-nums text-govbid-primary md:text-lg">
          {rfp.contract}
        </span>
      </div>
    </button>
  );
}
