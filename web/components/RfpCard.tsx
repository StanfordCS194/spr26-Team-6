"use client";

import type { ListCardLayout } from "@/lib/analytics";
import type { Rfp } from "@/lib/types";
import { ScoreRing } from "./ScoreRing";

// Simple color palette for tags
const TAG_COLORS = [
  "#e57373", // red
  "#64b5f6", // blue
  "#81c784", // green
  "#ffd54f", // yellow
  "#ba68c8", // purple
  "#4db6ac", // teal
  "#ffb74d", // orange
  "#a1887f", // brown
  "#90a4ae", // gray
];

// Deterministic color for a tag string
function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function TagBubble({ tag }: { tag: string }) {
  return (
    <span
      className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold mr-1 mb-1 border"
      style={{
        background: getTagColor(tag) + "22", // faded bg
        color: getTagColor(tag),
        borderColor: getTagColor(tag),
        minWidth: 0,
      }}
    >
      {tag}
    </span>
  );
}

type Props = {
  rfp: Rfp;
  active: boolean;
  onSelect: () => void;
  layout: ListCardLayout;
  isFavorited?: boolean;
  onFavoriteToggle?: (id: string) => void;
};

function dueParts(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return {
    day: d.getDate(),
    month: d.toLocaleString("en-US", { month: "long" }),
  };
}

function daysUntilDeadline(iso: string): number {
  const deadline = new Date(`${iso}T23:59:59`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = deadline.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDeadlineStatus(days: number): { text: string; color: string; bgColor: string } {
  if (days <= 0) return { text: "Expired", color: "text-red-700", bgColor: "bg-red-50 border-red-200" };
  if (days <= 3) return { text: `${days} day${days !== 1 ? "s" : ""} left`, color: "text-red-700", bgColor: "bg-red-50 border-red-200" };
  if (days <= 7) return { text: `${days} day${days !== 1 ? "s" : ""} left`, color: "text-yellow-700", bgColor: "bg-yellow-50 border-yellow-200" };
  return { text: `${days} day${days !== 1 ? "s" : ""} left`, color: "text-govbid-text-muted", bgColor: "bg-govbid-primary-muted" };
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

function StarIcon({ filled }: { filled?: boolean }) {
  if (filled) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function HeadlineFirstCard({
  rfp,
  active,
  onSelect,
  isFavorited,
  onFavoriteToggle,
}: Omit<Props, "layout">) {
  const { day, month } = dueParts(rfp.dueDate);
  const daysLeft = daysUntilDeadline(rfp.dueDate);
  const deadlineStatus = getDeadlineStatus(daysLeft);
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
        <span className={`mt-2 inline-block rounded-md border px-2 py-1 text-xs font-semibold ${deadlineStatus.bgColor} ${deadlineStatus.color}`}>
          {deadlineStatus.text}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-govbid-text md:text-base">
          {rfp.title}
        </p>
        <p className="mt-1 line-clamp-1 text-xs font-medium text-govbid-text-muted">{subtitle}</p>
        {rfp.tags[0] ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-govbid-text-muted">{rfp.agency}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1">
          {rfp.tags?.map((tag) => (
            <TagBubble key={tag} tag={tag} />
          ))}
        </div>
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

      <div className="flex shrink-0 flex-col items-end justify-between gap-1">
        {onFavoriteToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFavoriteToggle(rfp.id);
            }}
            className={`rounded p-1 transition ${
              isFavorited
                ? "text-yellow-500 hover:text-yellow-600"
                : "text-govbid-text-muted hover:text-yellow-400"
            }`}
            aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
            title={isFavorited ? "Remove from favorites" : "Add to favorites"}
          >
            <StarIcon filled={isFavorited} />
          </button>
        )}
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-govbid-text-muted">
            Match
          </span>
          <ScoreRing score={rfp.score} size={36} stroke={2.5} />
        </div>
      </div>
    </button>
  );
}

function ScoreFirstCard({ rfp, active, onSelect }: Omit<Props, "layout">) {
  const { day, month } = dueParts(rfp.dueDate);
  const daysLeft = daysUntilDeadline(rfp.dueDate);
  const deadlineStatus = getDeadlineStatus(daysLeft);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full gap-3 rounded-xl border bg-govbid-surface p-4 text-left shadow-[var(--govbid-shadow)] transition md:gap-4 md:p-5 ${
        active
          ? "border-govbid-primary/45 bg-govbid-primary-soft/60 shadow-[0_1px_3px_rgb(79_70_229/0.12)]"
          : "border-govbid-border hover:border-govbid-border-strong"
      }`}
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-govbid-primary">
          Fit
        </span>
        <ScoreRing score={rfp.score} size={56} stroke={4} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-govbid-text md:text-base">
          {rfp.title}
        </p>
        <p className="mt-1 line-clamp-1 text-xs font-medium text-govbid-text">{rfp.agency}</p>
        <p className="mt-1 text-xs font-semibold text-govbid-primary">{rfp.contract}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {rfp.tags.slice(0, 3).map((t) => (
            <TagBubble key={t} tag={t} />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center justify-center border-l border-govbid-border/80 pl-3 text-center md:pl-4">
        <span className="text-xl font-bold leading-none text-govbid-text md:text-2xl">{day}</span>
        <span className="mt-0.5 text-[10px] font-medium text-govbid-text-muted">{month}</span>
        <span className={`mt-2 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${deadlineStatus.bgColor} ${deadlineStatus.color}`}>
          {deadlineStatus.text}
        </span>
      </div>
    </button>
  );
}

export function RfpCard({ rfp, active, onSelect, layout }: Props) {
  if (layout === "score_first") {
    return <ScoreFirstCard rfp={rfp} active={active} onSelect={onSelect} />;
  }
  return <HeadlineFirstCard rfp={rfp} active={active} onSelect={onSelect} />;
}
