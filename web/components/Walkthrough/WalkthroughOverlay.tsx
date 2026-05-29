"use client";

import { useEffect, useRef } from "react";

interface WalkthroughOverlayProps {
  targetElements: HTMLElement[];
  /** When set, index-aligned rects override getBoundingClientRect for each target. */
  spotlightRects?: (DOMRectReadOnly | undefined)[];
  padding?: number;
  isVisible?: boolean;
}

function isElementVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + cornerRadius, y);
  ctx.lineTo(x + width - cornerRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
  ctx.lineTo(x + width, y + height - cornerRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height);
  ctx.lineTo(x + cornerRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
  ctx.lineTo(x, y + cornerRadius);
  ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
  ctx.closePath();
}

function drawSpotlightFromRect(
  ctx: CanvasRenderingContext2D,
  rect: DOMRectReadOnly,
  spotlightPadding: number,
) {
  const cornerRadius = 8;
  const x = Math.max(0, rect.left - spotlightPadding);
  const y = Math.max(0, rect.top - spotlightPadding);
  const right = Math.min(window.innerWidth, rect.right + spotlightPadding);
  const bottom = Math.min(window.innerHeight, rect.bottom + spotlightPadding);
  const width = right - x;
  const height = bottom - y;

  if (width <= 0 || height <= 0) return;

  ctx.globalCompositeOperation = "destination-out";
  drawRoundedRectPath(ctx, x, y, width, height, cornerRadius);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = "rgba(79, 70, 229, 0.8)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(79, 70, 229, 0.3)";
  ctx.shadowBlur = 12;
  drawRoundedRectPath(ctx, x, y, width, height, cornerRadius);
  ctx.stroke();
  ctx.shadowColor = "transparent";
}

function drawSpotlight(
  ctx: CanvasRenderingContext2D,
  element: HTMLElement,
  spotlightPadding: number,
) {
  drawSpotlightFromRect(ctx, element.getBoundingClientRect(), spotlightPadding);
}

export function WalkthroughOverlay({
  targetElements,
  spotlightRects,
  padding = 8,
  isVisible = true,
}: WalkthroughOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spotlightPadding = padding + 4;

  useEffect(() => {
    if (!canvasRef.current || !isVisible) return;

    const canvas = canvasRef.current;

    const paint = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (targetElements.length > 0) {
        for (let i = 0; i < targetElements.length; i++) {
          const element = targetElements[i];
          const customRect = spotlightRects?.[i];
          if (customRect) {
            drawSpotlightFromRect(ctx, customRect, spotlightPadding);
          } else if (isElementVisible(element)) {
            drawSpotlight(ctx, element, spotlightPadding);
          }
        }
      }
    };

    paint();
    window.addEventListener("resize", paint);
    window.addEventListener("scroll", paint, true);

    return () => {
      window.removeEventListener("resize", paint);
      window.removeEventListener("scroll", paint, true);
    };
  }, [targetElements, spotlightRects, isVisible, spotlightPadding]);

  if (!isVisible) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-40 cursor-default"
      style={{ pointerEvents: "none" }}
    />
  );
}
