"use client";

import { useEffect, useRef } from "react";

interface WalkthroughOverlayProps {
  targetElement: HTMLElement | null;
  padding?: number;
  isVisible?: boolean;
}

export function WalkthroughOverlay({
  targetElement,
  padding = 8,
  isVisible = true,
}: WalkthroughOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !isVisible) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to window size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Draw dark overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create spotlight/highlight area
    if (targetElement && targetElement.offsetParent !== null) {
      const rect = targetElement.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      const x = rect.left + scrollX - padding;
      const y = rect.top + scrollY - padding;
      const width = rect.width + padding * 2;
      const height = rect.height + padding * 2;

      // Clear the highlighted area
      ctx.globalCompositeOperation = "destination-out";
      ctx.clearRect(x, y, width, height);
      ctx.globalCompositeOperation = "source-over";

      // Draw border around highlighted area
      ctx.strokeStyle = "rgba(79, 70, 229, 0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
    }
  }, [targetElement, padding, isVisible]);

  const handleResize = () => {
    if (canvasRef.current) {
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
    }
  };

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!isVisible) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-40 cursor-default"
      style={{ pointerEvents: "none" }}
    />
  );
}
