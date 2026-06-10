"use client";

import { useEffect, useState } from "react";
import { WalkthroughBounceArrow } from "./WalkthroughBounceArrow";

const ME_BUTTON_SELECTOR = "#walkthrough-profile-me-button";

type PointerPosition = {
  left: number;
  top: number;
};

export function WalkthroughMePointer({ active }: { active: boolean }) {
  const [position, setPosition] = useState<PointerPosition | null>(null);

  useEffect(() => {
    if (!active) {
      setPosition(null);
      return;
    }

    const update = () => {
      const el = document.querySelector(ME_BUTTON_SELECTOR) as HTMLElement | null;
      if (!el || el.offsetParent === null) {
        setPosition(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      setPosition({
        left: rect.left + rect.width / 2,
        top: rect.bottom + 12,
      });
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
  }, [active]);

  if (!active || !position) return null;

  return (
    <div
      className="pointer-events-none fixed z-[55] -translate-x-1/2"
      style={{ left: position.left, top: position.top }}
      aria-hidden
    >
      <div className="flex flex-col items-center gap-1.5">
        <WalkthroughBounceArrow direction="up" size={52} />
        <span className="rounded-full bg-govbid-primary px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-govbid-surface shadow-md">
          Me
        </span>
      </div>
    </div>
  );
}
