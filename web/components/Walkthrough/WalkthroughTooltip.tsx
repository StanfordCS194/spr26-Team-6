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
}

type TooltipPosition = "bottom" | "top" | "left" | "right";

export function WalkthroughTooltip({
  title,
  description,
  targetElement,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onClose,
}: WalkthroughTooltipProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [placement, setPlacement] = useState<TooltipPosition>("bottom");
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updatePosition = () => {
      if (!tooltipRef.current) return;

      const tooltipWidth = 400;
      const tooltipHeight = tooltipRef.current.offsetHeight || 200;
      const padding = 16;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (!targetElement || targetElement.offsetParent === null) {
        // No target element - center the tooltip on screen
        const centerX = (viewportWidth - tooltipWidth) / 2;
        const centerY = (viewportHeight - tooltipHeight) / 2;
        setPosition({ x: centerX, y: centerY });
        setPlacement("bottom");
        return;
      }

      const rect = targetElement.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      // Calculate all possible positions
      const positions = {
        bottom: {
          x: rect.left + scrollX + rect.width / 2 - tooltipWidth / 2,
          y: rect.bottom + scrollY + padding,
        },
        top: {
          x: rect.left + scrollX + rect.width / 2 - tooltipWidth / 2,
          y: rect.top + scrollY - tooltipHeight - padding,
        },
        right: {
          x: rect.right + scrollX + padding,
          y: rect.top + scrollY + rect.height / 2 - tooltipHeight / 2,
        },
        left: {
          x: rect.left + scrollX - tooltipWidth - padding,
          y: rect.top + scrollY + rect.height / 2 - tooltipHeight / 2,
        },
      };

      // Check which positions keep tooltip visible
      const isVisible = (pos: typeof positions.bottom): boolean => {
        const right = pos.x + tooltipWidth;
        const bottom = pos.y + tooltipHeight;
        return (
          pos.x >= -50 &&
          pos.y >= -50 &&
          right <= viewportWidth + 50 &&
          bottom <= viewportHeight + 50
        );
      };

      // Priority order: bottom, right, left, top
      let finalPlacement: TooltipPosition = "bottom";
      let finalPos = positions.bottom;

      if (isVisible(positions.bottom)) {
        finalPlacement = "bottom";
        finalPos = positions.bottom;
      } else if (isVisible(positions.right)) {
        finalPlacement = "right";
        finalPos = positions.right;
      } else if (isVisible(positions.left)) {
        finalPlacement = "left";
        finalPos = positions.left;
      } else if (isVisible(positions.top)) {
        finalPlacement = "top";
        finalPos = positions.top;
      } else {
        // Fallback: clamp to viewport
        finalPos = {
          x: Math.max(padding, Math.min(finalPos.x, viewportWidth - tooltipWidth - padding)),
          y: Math.max(padding, Math.min(finalPos.y, viewportHeight - tooltipHeight - padding)),
        };
      }

      // Clamp to viewport boundaries
      finalPos.x = Math.max(padding, Math.min(finalPos.x, viewportWidth - tooltipWidth - padding));
      finalPos.y = Math.max(padding, Math.min(finalPos.y, viewportHeight - tooltipHeight - padding));

      setPlacement(finalPlacement);
      setPosition(finalPos);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [targetElement]);

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
      className="fixed z-50 max-w-sm rounded-lg border border-govbid-border bg-govbid-surface p-4 shadow-xl"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: placement === "bottom" || placement === "top" ? "translateX(-50%)" : undefined,
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
          className="rounded-lg px-3 py-1.5 text-sm font-medium bg-govbid-primary text-white transition hover:opacity-90"
        >
          {currentStep === totalSteps - 1 ? "Finish" : "Next →"}
        </button>
      </div>

      {/* Arrow pointing toward target */}
      {placement === "bottom" && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-full"
          style={{
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "8px solid var(--govbid-surface)",
            filter: "drop-shadow(-1px -1px 1px rgba(0,0,0,0.1))",
          }}
        />
      )}
      {placement === "top" && (
        <div
          className="absolute left-1/2 -translate-x-1/2 translate-y-full"
          style={{
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderBottom: "8px solid var(--govbid-surface)",
            filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.1))",
          }}
        />
      )}
      {placement === "left" && (
        <div
          className="absolute top-1/2 -translate-y-1/2 translate-x-full"
          style={{
            width: 0,
            height: 0,
            borderTop: "8px solid transparent",
            borderBottom: "8px solid transparent",
            borderLeft: "8px solid var(--govbid-surface)",
            filter: "drop-shadow(1px -1px 1px rgba(0,0,0,0.1))",
          }}
        />
      )}
      {placement === "right" && (
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-full"
          style={{
            width: 0,
            height: 0,
            borderTop: "8px solid transparent",
            borderBottom: "8px solid transparent",
            borderRight: "8px solid var(--govbid-surface)",
            filter: "drop-shadow(-1px 1px 1px rgba(0,0,0,0.1))",
          }}
        />
      )}
    </div>
  );
}
