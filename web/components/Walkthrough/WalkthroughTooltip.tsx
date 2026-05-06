"use client";

import { useEffect, useRef, useState } from "react";

interface WalkthroughTooltipProps {
  title: string;
  description: string;
  targetElement: HTMLElement | null;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  placement?: "bottom" | "top" | "left" | "right";
}

export function WalkthroughTooltip({
  title,
  description,
  targetElement,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onClose,
  placement = "bottom",
}: WalkthroughTooltipProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!targetElement || targetElement.offsetParent === null) return;

    const updatePosition = () => {
      const rect = targetElement.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      let x = rect.left + scrollX + rect.width / 2;
      let y = rect.top + scrollY;

      // Adjust position based on placement
      if (placement === "bottom") {
        y = rect.bottom + scrollY + 16;
        x -= tooltipRef.current?.offsetWidth ? tooltipRef.current.offsetWidth / 2 : 0;
      } else if (placement === "top") {
        y = rect.top + scrollY - 16;
        x -= tooltipRef.current?.offsetWidth ? tooltipRef.current.offsetWidth / 2 : 0;
        y -= tooltipRef.current?.offsetHeight || 0;
      }

      setPosition({ x, y });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [targetElement, placement]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
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
  }, [onNext, onPrev, onClose]);

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 max-w-sm rounded-lg border border-govbid-border bg-govbid-surface p-4 shadow-lg"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translateX(-50%)",
      }}
    >
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
        <p className="mt-2 text-sm text-govbid-text-muted leading-relaxed whitespace-pre-wrap">
          {description}
        </p>
      </div>

      {/* Navigation */}
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={onPrev}
          disabled={currentStep === 0}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-govbid-text-muted transition disabled:opacity-50 hover:bg-govbid-primary-muted disabled:hover:bg-transparent"
        >
          ← Previous
        </button>

        <span className="text-xs font-medium text-govbid-text-muted">
          {currentStep + 1} / {totalSteps}
        </span>

        <button
          onClick={onNext}
          disabled={currentStep === totalSteps - 1}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-govbid-text-muted transition disabled:opacity-50 hover:bg-govbid-primary-muted disabled:hover:bg-transparent"
        >
          Next →
        </button>
      </div>

      {/* Arrow pointing down */}
      <div
        className="absolute left-1/2 h-4 w-4 -translate-x-1/2 bg-govbid-surface"
        style={{
          top: "-8px",
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderBottom: `8px solid var(--govbid-surface)`,
          background: "none",
        }}
      />
    </div>
  );
}
