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
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create spotlight/highlight area
    if (targetElement && targetElement.offsetParent !== null) {
      const rect = targetElement.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      const padding = 12;
      const x = rect.left + scrollX - padding;
      const y = rect.top + scrollY - padding;
      const width = rect.width + padding * 2;
      const height = rect.height + padding * 2;
      const cornerRadius = 8;

      // Clear the highlighted area with rounded corners
      ctx.globalCompositeOperation = "destination-out";
      
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
      ctx.fill();
      
      ctx.globalCompositeOperation = "source-over";

      // Draw border around highlighted area
      ctx.strokeStyle = "rgba(79, 70, 229, 0.8)";
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(79, 70, 229, 0.3)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
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
      ctx.stroke();
      
      ctx.shadowColor = "transparent";

      // Draw animated arrow pointing to the highlighted element
      const arrowSize = 20;
      const arrowX = x + width + 30;
      const arrowY = y + height / 2;

      // Draw arrow shaft
      ctx.strokeStyle = "rgba(79, 70, 229, 0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(arrowX - arrowSize, arrowY);
      ctx.lineTo(arrowX + arrowSize, arrowY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw arrowhead
      ctx.fillStyle = "rgba(79, 70, 229, 0.6)";
      ctx.beginPath();
      ctx.moveTo(arrowX + arrowSize, arrowY);
      ctx.lineTo(arrowX + arrowSize - 8, arrowY - 6);
      ctx.lineTo(arrowX + arrowSize - 8, arrowY + 6);
      ctx.closePath();
      ctx.fill();
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
