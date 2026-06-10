"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

const DIVIDER_WIDTH_PX = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStoredRatio(
  storageKey: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (!storageKey || typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw == null) return fallback;
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return clamp(n, min, max);
  } catch {
    /* ignore */
  }
  return fallback;
}

type Props = {
  leading: ReactNode;
  trailing: ReactNode;
  /** Leading panel width as a fraction of the split area (desktop only). */
  defaultLeadingRatio?: number;
  minLeadingRatio?: number;
  maxLeadingRatio?: number;
  storageKey?: string;
  className?: string;
};

export function ResizableSplitPane({
  leading,
  trailing,
  defaultLeadingRatio = 0.44,
  minLeadingRatio = 0.22,
  maxLeadingRatio = 0.78,
  storageKey,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Default on server + first client paint so SSR HTML matches hydration.
  const [leadingRatio, setLeadingRatio] = useState(defaultLeadingRatio);
  const draggingRef = useRef(false);

  useEffect(() => {
    setLeadingRatio(
      readStoredRatio(
        storageKey,
        defaultLeadingRatio,
        minLeadingRatio,
        maxLeadingRatio,
      ),
    );
  }, [storageKey, defaultLeadingRatio, minLeadingRatio, maxLeadingRatio]);

  const persistRatio = useCallback(
    (ratio: number) => {
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, String(ratio));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const applyRatioFromPointer = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const usable = rect.width - DIVIDER_WIDTH_PX;
      if (usable <= 0) return;
      const offset = clientX - rect.left;
      const next = clamp(
        offset / usable,
        minLeadingRatio,
        maxLeadingRatio,
      );
      setLeadingRatio(next);
      persistRatio(next);
    },
    [maxLeadingRatio, minLeadingRatio, persistRatio],
  );

  const endDrag = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      applyRatioFromPointer(e.clientX);
    };
    const onPointerUp = () => {
      if (!draggingRef.current) return;
      endDrag();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [applyRatioFromPointer, endDrag]);

  const onDividerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.currentTarget.setPointerCapture(e.pointerId);
    applyRatioFromPointer(e.clientX);
  };

  const onDividerPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) {
      endDrag();
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onDividerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.04;
    let next = leadingRatio;
    if (e.key === "ArrowLeft") next = leadingRatio - step;
    else if (e.key === "ArrowRight") next = leadingRatio + step;
    else return;
    e.preventDefault();
    next = clamp(next, minLeadingRatio, maxLeadingRatio);
    setLeadingRatio(next);
    persistRatio(next);
  };

  const leadingPercent = `${leadingRatio * 100}%`;

  return (
    <>
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col lg:hidden ${className}`}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{leading}</div>
        {trailing}
      </div>

      <div
        ref={containerRef}
        className={`hidden min-h-0 min-w-0 flex-1 lg:flex ${className}`}
      >
        <div
          className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          style={{ width: leadingPercent, flexShrink: 0 }}
        >
          {leading}
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(leadingRatio * 100)}
          aria-valuemin={Math.round(minLeadingRatio * 100)}
          aria-valuemax={Math.round(maxLeadingRatio * 100)}
          aria-label="Resize panels"
          tabIndex={0}
          onPointerDown={onDividerPointerDown}
          onPointerUp={onDividerPointerUp}
          onKeyDown={onDividerKeyDown}
          className="group relative z-30 shrink-0 cursor-col-resize touch-none focus:outline-none"
          style={{ width: DIVIDER_WIDTH_PX }}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-govbid-border transition-colors group-hover:bg-govbid-primary/70 group-active:bg-govbid-primary group-focus-visible:bg-govbid-primary" />
          <div
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-1 rounded-full border border-govbid-border bg-govbid-surface px-0.5 py-2 shadow-sm transition-colors group-hover:border-govbid-primary/50 group-focus-visible:border-govbid-primary"
            aria-hidden
          >
            <span className="block h-0.5 w-0.5 rounded-full bg-govbid-text-muted group-hover:bg-govbid-primary" />
            <span className="block h-0.5 w-0.5 rounded-full bg-govbid-text-muted group-hover:bg-govbid-primary" />
            <span className="block h-0.5 w-0.5 rounded-full bg-govbid-text-muted group-hover:bg-govbid-primary" />
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {trailing}
        </div>
      </div>
    </>
  );
}
