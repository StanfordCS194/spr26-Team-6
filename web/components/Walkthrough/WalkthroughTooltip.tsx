"use client";

import { useEffect } from "react";

interface WalkthroughTooltipProps {
  title: string;
  description: string;
  targetElement: HTMLElement | null;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  nextDisabled?: boolean;
  nextHint?: string;
  /** e.g. "Part 2 of 3" for sub-steps within a tour step */
  phaseProgress?: string;
  nextLabel?: string;
}

export function WalkthroughTooltip({
  title,
  description,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onClose,
  nextDisabled = false,
  nextHint,
  phaseProgress,
  nextLabel,
}: WalkthroughTooltipProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (nextDisabled) return;
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        onPrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNext, onPrev, onClose, nextDisabled]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-live="polite"
    >
      <div className="relative pointer-events-auto w-full max-w-sm rounded-lg border border-govbid-border bg-govbid-surface p-4 shadow-xl">
        {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-3 top-3 rounded-lg p-1 text-govbid-text-muted transition hover:bg-govbid-primary-muted hover:text-govbid-text"
        aria-label="Close walkthrough"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Title and Description */}
      <div className="pr-6">
        <h3 className="text-sm font-bold text-govbid-text">{title}</h3>
        {phaseProgress ? (
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-govbid-primary">
            {phaseProgress}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-govbid-text-muted leading-relaxed whitespace-pre-wrap">
          {description}
        </p>
        {nextHint ? (
          <p className="mt-3 text-xs font-semibold text-govbid-primary">{nextHint}</p>
        ) : null}
      </div>

      {/* Navigation */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          onClick={onPrev}
          disabled={currentStep === 0}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-govbid-text-muted transition disabled:opacity-50 hover:bg-govbid-primary-muted disabled:hover:bg-transparent"
        >
          ← Previous
        </button>

        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition ${
                  i === currentStep ? "bg-govbid-primary" : "bg-govbid-border"
                }`}
              />
            ))}
          </div>
          <span className="text-xs font-medium text-govbid-text-muted ml-1">
            {currentStep + 1}/{totalSteps}
          </span>
        </div>

        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="rounded-lg px-3 py-1.5 text-sm font-medium bg-govbid-primary text-govbid-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {nextLabel ??
            (currentStep === totalSteps - 1 ? "Finish" : "Next →")}
        </button>
        </div>
      </div>
    </div>
  );
}
