"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { SourceDocumentEmbed } from "./SourceDocumentEmbed";

type Props = {
  url: string;
};

export function RfpPdfViewer({ url }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(480);
  const [iframeFallback, setIframeFallback] = useState(false);

  useEffect(() => {
    setIframeFallback(false);
    setNumPages(0);
  }, [url]);

  useLayoutEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }, []);

  useLayoutEffect(() => {
    const el = document.getElementById("rfp-pdf-viewport");
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 40) {
        setPageWidth(Math.min(640, Math.floor(w - 8)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (iframeFallback) {
    return (
      <div className="flex w-full flex-col gap-2">
        <p className="text-center text-xs text-govbid-text-muted">
          Showing browser embed instead (pdf.js could not load this file).
          If the frame is blank, the host may block embedding — open in a new
          tab.
        </p>
        <SourceDocumentEmbed url={url} title="RFP PDF" />
        <div className="flex justify-center gap-3 text-xs">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-govbid-primary underline"
          >
            Open in new tab
          </a>
          <button
            type="button"
            onClick={() => setIframeFallback(false)}
            className="font-semibold text-govbid-text-muted underline decoration-govbid-border hover:text-govbid-text"
          >
            Retry built-in viewer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="rfp-pdf-viewport"
      className="flex min-h-0 w-full flex-col items-center overflow-auto rounded-xl border border-govbid-border bg-govbid-elevated p-2"
    >
      <Document
        file={url}
        className="flex flex-col items-center gap-3"
        loading={
          <p className="py-8 text-sm text-govbid-text-muted">Loading PDF…</p>
        }
        error={
          <div className="max-w-md space-y-3 py-6 text-center text-sm text-govbid-text-muted">
            <p>
              The built-in viewer could not load this file (often CORS). Try
              the browser embed below, or open in a new tab.
            </p>
            <button
              type="button"
              onClick={() => setIframeFallback(true)}
              className="rounded-lg border border-govbid-border bg-govbid-surface px-3 py-1.5 text-xs font-semibold text-govbid-primary hover:border-govbid-primary"
            >
              Try browser embed
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-semibold text-govbid-primary underline"
            >
              Open in new tab
            </a>
          </div>
        }
        onLoadError={() => setIframeFallback(true)}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
      >
        {numPages > 0
          ? Array.from({ length: numPages }, (_, i) => (
              <Page
                key={i + 1}
                pageNumber={i + 1}
                width={pageWidth}
                className="shadow-sm"
              />
            ))
          : null}
      </Document>
    </div>
  );
}
