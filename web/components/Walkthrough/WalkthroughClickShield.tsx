"use client";

import { useEffect, useState } from "react";

type HoleRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function blockPointer(e: React.SyntheticEvent) {
  e.preventDefault();
  e.stopPropagation();
}

type WalkthroughClickShieldProps = {
  /** Live element whose bounding box defines the interact hole. */
  holeElement?: HTMLElement | null;
  /** Fixed rect for the interact hole (e.g. feed + pagination). */
  holeRect?: DOMRectReadOnly | null;
  padding?: number;
};

function toHoleRect(
  rect: DOMRectReadOnly | null | undefined,
): HoleRect | null {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function WalkthroughClickShield({
  holeElement,
  holeRect,
  padding = 12,
}: WalkthroughClickShieldProps) {
  const [hole, setHole] = useState<HoleRect | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const update = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });

      if (holeElement) {
        const elementRect = holeElement.getBoundingClientRect();
        setHole(toHoleRect(elementRect));
        return;
      }

      setHole(toHoleRect(holeRect ?? null));
    };

    update();
    const interval = window.setInterval(update, 120);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [holeElement, holeRect, padding]);

  if (!hole || viewport.w === 0) {
    return (
      <div
        className="fixed inset-0 z-[45]"
        aria-hidden
        onClick={blockPointer}
        onPointerDown={blockPointer}
      />
    );
  }

  const padded = {
    top: Math.max(0, hole.top - padding),
    left: Math.max(0, hole.left - padding),
    width: hole.width + padding * 2,
    height: hole.height + padding * 2,
  };
  const right = padded.left + padded.width;
  const bottom = padded.top + padded.height;
  const { w, h } = viewport;

  const panels = [
    { top: 0, left: 0, width: w, height: padded.top },
    { top: bottom, left: 0, width: w, height: Math.max(0, h - bottom) },
    { top: padded.top, left: 0, width: padded.left, height: padded.height },
    {
      top: padded.top,
      left: right,
      width: Math.max(0, w - right),
      height: padded.height,
    },
  ];

  return (
    <>
      {panels.map((panel, index) =>
        panel.width > 0 && panel.height > 0 ? (
          <div
            key={index}
            className="fixed z-[45]"
            style={{
              top: panel.top,
              left: panel.left,
              width: panel.width,
              height: panel.height,
            }}
            aria-hidden
            onClick={blockPointer}
            onPointerDown={blockPointer}
          />
        ) : null,
      )}
    </>
  );
}
