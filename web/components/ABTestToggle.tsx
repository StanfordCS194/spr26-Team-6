"use client";

import { useState } from "react";
import { useABTest, type Variant } from "@/context/ABTestContext";

function ToggleSwitch({
  label,
  variant,
  onToggle,
}: {
  label: string;
  variant: Variant;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-govbid-text">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-6 w-11 items-center rounded-full border border-govbid-border bg-govbid-surface p-0.5 transition-colors"
        aria-label={`Toggle ${label} variant`}
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
  );
}

export function ABTestToggle() {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    dashboardVariant,
    detailPanelVariant,
    toggleDashboardVariant,
    toggleDetailPanelVariant,
  } = useABTest();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {isExpanded && (
        <div className="flex flex-col gap-3 rounded-xl border border-govbid-border bg-govbid-surface p-4 shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
              A/B Test Variants
            </h3>
          </div>
          <div className="flex flex-col gap-2">
            <ToggleSwitch
              label="Dashboard"
              variant={dashboardVariant}
              onToggle={toggleDashboardVariant}
            />
            <ToggleSwitch
              label="Detail Panel"
              variant={detailPanelVariant}
              onToggle={toggleDetailPanelVariant}
            />
          </div>
          <p className="text-[10px] leading-tight text-govbid-text-muted">
            Switch between UI variants to compare designs.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-govbid-border bg-govbid-primary text-white shadow-lg transition-transform hover:scale-105"
        aria-label={isExpanded ? "Close A/B test panel" : "Open A/B test panel"}
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
