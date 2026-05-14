"use client";

import { useState } from "react";
import { trackABTestEvent } from "@/app/posthog-provider";
import { useABTest, type Variant } from "@/context/ABTestContext";

function ToggleSwitch({
  label,
  detail,
  variant,
  onToggle,
}: {
  label: string;
  detail: string;
  variant: Variant;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-govbid-text">{label}</span>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-6 w-11 shrink-0 items-center rounded-full border border-govbid-border bg-govbid-surface p-0.5 transition-colors"
          aria-label={`Toggle ${label} variant, currently ${variant}`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
              variant === "B"
                ? "translate-x-5 bg-govbid-primary text-white"
                : "translate-x-0 bg-govbid-border-strong text-govbid-text-muted"
            }`}
          >
            {variant}
          </span>
        </button>
      </div>
      <p className="text-[10px] leading-snug text-govbid-text-muted">{detail}</p>
    </div>
  );
}

export function ABTestToggle() {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    dashboardVariant,
    detailPanelVariant,
    toggleDashboardVariant,
    toggleDetailPanelVariant,
    setDashboardVariant,
    setDetailPanelVariant,
  } = useABTest();

  const useRecommended = () => {
    trackABTestEvent("ab_test_reset_to_recommended", {
      from_dashboard: dashboardVariant,
      from_detail_panel: detailPanelVariant,
    });
    setDashboardVariant("A");
    setDetailPanelVariant("A");
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {isExpanded && (
        <div className="flex w-[min(100vw-2rem,18rem)] flex-col gap-3 rounded-xl border border-govbid-border bg-govbid-surface p-4 shadow-lg">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
              UI variants (internal testing)
            </h3>
            <p className="mt-1 text-[10px] leading-snug text-govbid-text-muted">
              Session research favored the default layout: list + detail with the tabbed detail panel (A). Variant B options stay available for comparison and demos.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <ToggleSwitch
              label="Dashboard layout"
              detail="A: sidebar, list, then detail. B: detail left, list right."
              variant={dashboardVariant}
              onToggle={toggleDashboardVariant}
            />
            <ToggleSwitch
              label="Detail panel"
              detail="A: tabs + overview (recommended). B: card-style header and sections."
              variant={detailPanelVariant}
              onToggle={toggleDetailPanelVariant}
            />
          </div>
          {(dashboardVariant !== "A" || detailPanelVariant !== "A") && (
            <button
              type="button"
              onClick={useRecommended}
              className="rounded-lg border border-govbid-primary/40 bg-govbid-primary-muted px-3 py-2 text-xs font-semibold text-govbid-primary transition hover:bg-govbid-primary-soft"
            >
              Reset to recommended (A / A)
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-govbid-border bg-govbid-primary text-white shadow-lg transition-transform hover:scale-105"
        aria-label={isExpanded ? "Close UI variants panel" : "Open UI variants panel"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isExpanded ? (
            <path d="M18 6 6 18M6 6l12 12" />
          ) : (
            <>
              <path d="M10.5 2H5.5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
              <path d="M13.5 2h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
              <path d="M7 7h3" />
              <path d="M7 12h3" />
              <path d="M14 7h3" />
              <path d="M14 12h3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
